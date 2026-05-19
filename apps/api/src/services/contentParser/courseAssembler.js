'use strict';

const { randomUUID } = require('crypto');

// Map 3-file block types to JSONB content block types (schema_version: 3)
// New types that have no existing equivalent use their own type string.
// The RichLessonRenderer must handle them (Phase 6).
const BLOCK_TYPE_MAP = {
  INTRO_TEXT:          'rich_text',
  SECTION_TITLE:       'heading',
  KEY_INFORMATION:     'key_information',
  WARNING_BOX:         'warning_box',
  CRITICAL_INFORMATION:'critical_information',
  STEP_LIST:           'step_list',
  IMAGE_SLOT:          'image_slot',
  QUIZ_POINT:          'quiz_point',
  SUMMARY:             'summary',
  BEST_PRACTICE:       'best_practice',
  IMPORTANT_NOTE:      'important_note',
  OBJECTIVE_LIST:      'objective_list',
  REFERENCE_TABLE:     'reference_table',
  REFLECTION_PROMPTS:  'reflection_prompts',
};

/**
 * assembleCourseDom(resolvedCourseDom, courseId, orgId, userId, db): AssemblyResult
 * Writes the parsed Course DOM to the database inside a transaction.
 */
async function assembleCourseDom(resolvedCourseDom, courseId, orgId, userId, db) {
  const result = {
    modulesCreated: 0,
    lessonsCreated: 0,
    blocksCreated: 0,
    imageMappingsCreated: 0,
    moduleIds: [],
    lessonIds: [],
    errors: [],
  };

  // Run everything in a transaction
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    let moduleOrderIndex = 0;

    for (const mod of resolvedCourseDom.modules) {
      // Insert module
      const modRes = await client.query(
        `INSERT INTO modules (id, course_id, title, description, order_index, status)
         VALUES ($1, $2, $3, $4, $5, 'draft')
         RETURNING id`,
        [randomUUID(), courseId, mod.title, '', moduleOrderIndex]
      );
      const moduleId = modRes.rows[0].id;
      result.moduleIds.push(moduleId);
      result.modulesCreated++;
      moduleOrderIndex++;

      let lessonOrderIndex = 0;

      for (const lesson of mod.lessons) {
        // Build lesson content JSONB in schema_version: 3 format
        const contentBlocks = buildLessonBlocks(lesson.blocks);
        const lessonContent = {
          schema_version: 3,
          title: lesson.title,
          blocks: contentBlocks,
          metadata: {
            locale: 'en',
            tags: [],
            readingMinutes: Math.max(1, Math.round(contentBlocks.length * 0.5)),
          },
        };

        // Insert lesson
        const lessonRes = await client.query(
          `INSERT INTO lessons (id, module_id, title, content, status, order_index, duration_minutes)
           VALUES ($1, $2, $3, $4, 'draft', $5, $6)
           RETURNING id`,
          [
            randomUUID(),
            moduleId,
            lesson.title,
            JSON.stringify(lessonContent),
            lessonOrderIndex,
            Math.max(1, Math.round(contentBlocks.length * 0.5)),
          ]
        );
        const lessonId = lessonRes.rows[0].id;
        result.lessonIds.push(lessonId);
        result.lessonsCreated++;
        lessonOrderIndex++;

        // Insert lesson_blocks_parsed records
        for (const block of lesson.blocks) {
          const imgMappingId = block.blockType === 'IMAGE_SLOT' ? block._imageMappingId || null : null;
          const resStatus = block.blockType === 'IMAGE_SLOT' ? (block.resolutionStatus || 'unresolved') : 'na';

          await client.query(
            `INSERT INTO lesson_blocks_parsed
               (id, lesson_id, course_id, block_index, block_type, block_data, image_mapping_id, resolution_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              randomUUID(),
              lessonId,
              courseId,
              block.blockIndex,
              block.blockType,
              JSON.stringify(block.data || {}),
              imgMappingId,
              resStatus,
            ]
          );
          result.blocksCreated++;
        }
      }
    }

    // Insert image_mappings records for all image slots
    const importJobId = resolvedCourseDom._importJobId || null;
    const seenImageIds = new Set();

    for (const mod of resolvedCourseDom.modules) {
      for (const lesson of mod.lessons) {
        for (const block of lesson.blocks) {
          if (block.blockType === 'IMAGE_SLOT' && block.imageId && !seenImageIds.has(block.imageId)) {
            seenImageIds.add(block.imageId);
            const mapping = block.mapping || {};

            const imgMappingRes = await client.query(
              `INSERT INTO image_mappings
                 (id, import_job_id, course_id, image_id, lesson_context, chapter_context,
                  placement, position, ratio, size_spec, alignment, frame_style, filename,
                  notes, resolution_status, is_sequential_set, sequential_set_key)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
               ON CONFLICT (course_id, image_id) DO UPDATE
                 SET resolution_status = EXCLUDED.resolution_status,
                     import_job_id = EXCLUDED.import_job_id
               RETURNING id`,
              [
                randomUUID(),
                importJobId,
                courseId,
                block.imageId,
                mapping.lessonContext || '',
                mapping.chapterContext || '',
                mapping.placement || '',
                mapping.position || 'full_width',
                mapping.ratio || '16:9',
                mapping.sizeSpec || '',
                mapping.alignment || 'center',
                mapping.frameStyle || 'none',
                mapping.filename || '',
                mapping.notes || '',
                block.resolutionStatus === 'resolved' ? 'resolved'
                  : block.resolutionStatus === 'asset_pending' ? 'asset_pending'
                  : 'unresolved',
                block.isSequentialSet || false,
                block.sequentialSetKey || null,
              ]
            );

            result.imageMappingsCreated++;

            // If resolved, link media asset
            if (block.resolutionStatus === 'resolved' && block.mediaAssetId) {
              const imgMappingId = imgMappingRes.rows[0].id;
              await client.query(
                `UPDATE image_mappings SET media_asset_id = $1 WHERE id = $2`,
                [block.mediaAssetId, imgMappingId]
              );
              await client.query(
                `UPDATE media_assets SET image_id = $1, image_mapping_id = $2 WHERE id = $3`,
                [block.imageId, imgMappingId, block.mediaAssetId]
              );
            }
          }
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return result;
}

function buildLessonBlocks(blocks) {
  return blocks.map((block, idx) => {
    const type = BLOCK_TYPE_MAP[block.blockType] || block.blockType.toLowerCase();
    const payload = buildPayload(block);

    return {
      id: `3file-${block.blockType.toLowerCase()}-${idx}`,
      type,
      order: idx,
      payload,
      meta: {
        analyticsKey: `${type}_${idx + 1}`,
        tags: [],
        aiHints: { semanticRole: block.blockType, summary: '', difficulty: '' },
      },
    };
  });
}

function buildPayload(block) {
  const d = block.data || {};

  switch (block.blockType) {
    case 'INTRO_TEXT':
      return { text: d.text || '' };
    case 'SECTION_TITLE':
      return { text: d.text || '', level: 2 };
    case 'KEY_INFORMATION':
    case 'WARNING_BOX':
    case 'CRITICAL_INFORMATION':
    case 'BEST_PRACTICE':
    case 'IMPORTANT_NOTE':
      return { text: d.text || '', tone: blockTone(block.blockType) };
    case 'STEP_LIST':
      return { steps: d.steps || [], text: d.text || '' };
    case 'OBJECTIVE_LIST':
      return { objectives: d.objectives || [], text: d.text || '' };
    case 'IMAGE_SLOT':
      return {
        imageId: block.imageId || null,
        position: block.mapping?.position || 'full_width',
        ratio: block.mapping?.ratio || '16:9',
        frameStyle: block.mapping?.frameStyle || 'none',
        alignment: block.mapping?.alignment || 'center',
        cdnUrl: block.cdnUrl || null,
        resolutionStatus: block.resolutionStatus || 'unresolved',
        isSequentialSet: block.isSequentialSet || false,
        sequentialSetKey: block.sequentialSetKey || null,
        sequentialSetIncomplete: block.sequentialSetIncomplete || false,
      };
    case 'QUIZ_POINT':
      return {
        question: d.question || '',
        options: d.options || [],
        correct: d.correct ?? 0,
        rationale: d.rationale || '',
      };
    case 'SUMMARY':
    case 'REFLECTION_PROMPTS':
    case 'REFERENCE_TABLE':
      return { text: d.text || '' };
    default:
      return { text: d.text || '' };
  }
}

function blockTone(blockType) {
  switch (blockType) {
    case 'KEY_INFORMATION': return 'info';
    case 'WARNING_BOX': return 'warning';
    case 'CRITICAL_INFORMATION': return 'danger';
    case 'BEST_PRACTICE': return 'success';
    case 'IMPORTANT_NOTE': return 'info';
    default: return 'info';
  }
}

module.exports = { assembleCourseDom };
