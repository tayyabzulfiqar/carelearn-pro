'use strict';

/**
 * resolve(courseDom, mappingIndex, db): ResolvedCourseDom
 * Joins the Course DOM with the Mapping Index and media_assets DB.
 */
async function resolve(courseDom, mappingIndex, db) {
  const resolutionReport = {
    resolvedCount: 0,
    pendingCount: 0,
    errorCount: 0,
    errors: [],
    pendingAssets: [],
  };

  // Deep-clone the DOM to avoid mutation
  const resolved = JSON.parse(JSON.stringify(courseDom));

  // Collect all IMAGE_SLOT blocks across all lessons for sequential set detection
  const allSlots = [];
  for (const mod of resolved.modules) {
    for (const lesson of mod.lessons) {
      for (const block of lesson.blocks) {
        if (block.blockType === 'IMAGE_SLOT') {
          allSlots.push({ block, lessonTitle: lesson.title, moduleTitle: mod.title });
        }
      }
    }
  }

  // Resolve each IMAGE_SLOT
  for (const { block, lessonTitle } of allSlots) {
    const imageId = block.imageId;
    if (!imageId) {
      block.resolutionStatus = 'unresolved_error';
      resolutionReport.errorCount++;
      resolutionReport.errors.push({ imageId: null, lesson: lessonTitle, reason: 'Missing image ID on IMAGE_SLOT block' });
      continue;
    }

    const mapping = mappingIndex[imageId];
    if (!mapping) {
      block.resolutionStatus = 'unresolved_error';
      resolutionReport.errorCount++;
      resolutionReport.errors.push({ imageId, lesson: lessonTitle, reason: `No mapping record found in FILE 2` });
      continue;
    }

    // Annotate block with all mapping fields
    block.mapping = mapping;
    block.resolutionStatus = 'mapped';

    // Query media_assets for the file
    let assetRow = null;
    try {
      const result = await db.query(
        `SELECT id, storage_path, mime_type, file_name FROM media_assets
         WHERE image_id = $1 OR file_name = $2 OR file_name ILIKE $3
         LIMIT 1`,
        [imageId, mapping.filename, `%${imageId}%`]
      );
      if (result.rows.length > 0) {
        assetRow = result.rows[0];
      }
    } catch (_err) {
      // DB error — treat as pending
    }

    if (assetRow) {
      block.resolutionStatus = 'resolved';
      block.cdnUrl = assetRow.storage_path;
      block.mediaAssetId = assetRow.id;
      resolutionReport.resolvedCount++;
    } else {
      block.resolutionStatus = 'asset_pending';
      resolutionReport.pendingCount++;
      resolutionReport.pendingAssets.push({
        imageId,
        filename: mapping.filename,
        lesson: lessonTitle,
      });
    }
  }

  // Sequential set detection: consecutive IMAGE_SLOT blocks in same lesson with sequential IDs
  for (const mod of resolved.modules) {
    for (const lesson of mod.lessons) {
      detectSequentialSets(lesson.blocks);
    }
  }

  // If any member of a sequential set is incomplete, mark all as SEQUENTIAL_SET_INCOMPLETE
  for (const mod of resolved.modules) {
    for (const lesson of mod.lessons) {
      markIncompleteSequentialSets(lesson.blocks);
    }
  }

  return { courseDom: resolved, resolutionReport };
}

function detectSequentialSets(blocks) {
  const imageSlots = blocks.filter(b => b.blockType === 'IMAGE_SLOT' && b.imageId);

  // Detect consecutive slots with sequential numeric IDs
  for (let i = 0; i < imageSlots.length - 1; i++) {
    const curr = imageSlots[i];
    const next = imageSlots[i + 1];
    const currNum = parseInt(curr.imageId.replace('IMG_', ''), 10);
    const nextNum = parseInt(next.imageId.replace('IMG_', ''), 10);

    if (nextNum === currNum + 1) {
      // Find the full extent of this set
      let start = i;
      let end = i + 1;
      while (end < imageSlots.length - 1) {
        const endNum = parseInt(imageSlots[end].imageId.replace('IMG_', ''), 10);
        const nextEndNum = parseInt(imageSlots[end + 1].imageId.replace('IMG_', ''), 10);
        if (nextEndNum === endNum + 1) end++;
        else break;
      }

      if (end > start) {
        const setKey = `${imageSlots[start].imageId}-${imageSlots[end].imageId}`;
        for (let j = start; j <= end; j++) {
          imageSlots[j].isSequentialSet = true;
          imageSlots[j].sequentialSetKey = setKey;
          imageSlots[j].sequentialSetSize = end - start + 1;
        }
        i = end; // skip ahead
      }
    }
  }
}

function markIncompleteSequentialSets(blocks) {
  // Group by set key
  const sets = {};
  for (const block of blocks) {
    if (block.isSequentialSet && block.sequentialSetKey) {
      if (!sets[block.sequentialSetKey]) sets[block.sequentialSetKey] = [];
      sets[block.sequentialSetKey].push(block);
    }
  }

  for (const setBlocks of Object.values(sets)) {
    const hasIncomplete = setBlocks.some(
      b => b.resolutionStatus === 'unresolved_error' || b.resolutionStatus === 'asset_pending' || b.resolutionStatus === 'unresolved'
    );
    if (hasIncomplete) {
      for (const block of setBlocks) {
        block.sequentialSetIncomplete = true;
      }
    }
  }
}

module.exports = { resolve };
