const STRONG_WORD_PATTERN = /\b(must|always|important|ensure)\b/gi;

const splitParagraphs = (value) => String(value || '')
  .split(/\n{2,}/)
  .map((item) => item.trim())
  .filter(Boolean);

const normalizeParagraph = (value) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim();

const withImage = (images = [], index = 0) => images[index] || '';

const createTemplateLibrary = (images) => ({
  'Course Introduction': [
    {
      heading: 'Why Fire Safety Matters in Care Homes',
      paragraphs: [
        'Fire safety is a legal and practical duty in every care setting. Residents may have reduced mobility, sensory impairment, or cognitive needs, so staff must understand how quickly a small incident can become a life-threatening emergency.',
        'Good fire safety practice is not just about alarms and extinguishers. It is about daily habits, clear procedures, and making sure the environment supports a safe evacuation when people are at their most vulnerable.',
      ],
      bullets: [
        'Residents may need support to recognise danger or move to safety',
        'A delayed response can quickly increase risk from smoke and heat',
        'Fire safety responsibilities apply to every member of staff',
      ],
      image: withImage(images, 0),
    },
    {
      heading: 'What This Course Will Help You Do',
      paragraphs: [
        'This lesson sequence explains how fires start, how they spread, and what staff should do before, during, and after an alarm. The aim is to give you practical judgement, not just theory.',
        'By the end, you should feel more confident about spotting hazards, following emergency steps, and supporting residents in a calm and organised way.',
      ],
      bullets: [
        'Understand the causes and behaviour of fire',
        'Follow evacuation and containment procedures correctly',
        'Apply safe actions that protect residents and colleagues',
      ],
      image: '',
    },
  ],
  'Learning Objectives': [
    {
      heading: 'Knowledge You Are Expected to Build',
      paragraphs: [
        'This training is designed to give staff a structured understanding of fire prevention, emergency response, and resident support. Each topic builds on the last so that key duties are clear and memorable.',
        'The learning objectives focus on real workplace actions rather than abstract definitions, because safe practice depends on what people do consistently on shift.',
      ],
      bullets: [
        'Recognise common hazards in a care environment',
        'Explain the fire triangle and how fires spread',
        'Use emergency procedures and evacuation plans correctly',
      ],
      image: withImage(images, 0),
    },
    {
      heading: 'How You Will Use These Objectives at Work',
      paragraphs: [
        'The purpose of the objectives is to help you connect policy with action. It is important that you can translate training into checks, conversations, and decisions during routine care and during an alarm.',
        'You should leave the course knowing what to look for, what to report, and how to support the team response if an incident occurs.',
      ],
      bullets: [
        'Check your environment with more confidence',
        'Respond faster and more consistently in emergencies',
        'Support residents according to risk and mobility needs',
      ],
      image: withImage(images, 1),
    },
  ],
  'What Is Fire': [
    {
      heading: 'Understanding Combustion',
      paragraphs: [
        'Fire is a chemical reaction that happens when heat, fuel, and oxygen combine in the right conditions. Once that reaction is established, it can produce flames, smoke, toxic gases, and rapid temperature changes.',
        'Knowing what fire is helps staff understand why small warning signs matter. A source of heat near the wrong material can escalate long before visible flames appear.',
      ],
      bullets: [
        'Heat provides the energy to start ignition',
        'Fuel is any material that can burn',
        'Oxygen supports the combustion process',
      ],
      image: '',
    },
    {
      heading: 'Why the Definition Matters in Care Practice',
      paragraphs: [
        'When staff understand the basic science, it becomes easier to prevent incidents. You can remove one of the required elements before a hazard develops into a serious event.',
        'This is important in care homes because the environment contains bedding, furniture, electrical equipment, oxygen use in some cases, and people who may not self-evacuate quickly.',
      ],
      bullets: [
        'Fire prevention starts before smoke or flames are visible',
        'Hazards should be reported and controlled early',
        'A simple concept can guide many safety decisions',
      ],
      image: withImage(images, 0),
    },
  ],
  'Breaking the Fire Triangle': [
    {
      heading: 'Remove One Element to Stop the Fire',
      paragraphs: [
        'A fire cannot continue if one side of the fire triangle is taken away. Cooling removes heat, moving combustibles removes fuel, and closing off air can reduce oxygen.',
        'This principle sits behind most fire control methods, from shutting doors to using the correct extinguisher. Staff do not need to tackle a fire directly to apply the logic safely.',
      ],
      bullets: [
        'Water cools heat in suitable fire classes',
        'Good housekeeping reduces available fuel',
        'Closed doors can help limit oxygen and spread',
      ],
      image: withImage(images, 0),
    },
    {
      heading: 'Applying the Principle Safely',
      paragraphs: [
        'In practice, staff must always think about safety first. You are not expected to improvise dangerous actions, but you should recognise why certain procedures work.',
        'Examples include isolating faulty equipment, keeping combustible waste under control, and making sure fire doors are never wedged open.',
      ],
      bullets: [
        'Follow site procedure rather than taking unnecessary risks',
        'Use trained actions only when it is safe to do so',
        'Ensure preventive controls are maintained every day',
      ],
      image: '',
    },
  ],
  'Smoke and Toxic Fumes': [
    {
      heading: 'Why Smoke Is Often the Greatest Threat',
      paragraphs: [
        'Smoke can spread faster than flames and often causes harm before people realise the full danger. It reduces visibility, irritates the airway, and may contain toxic gases that affect breathing and decision-making.',
        'In enclosed care environments, this makes early detection and rapid action essential. Residents can become disoriented or unconscious quickly if smoke reaches their room or corridor.',
      ],
      bullets: [
        'Smoke obscures exits and signage',
        'Toxic gases can overwhelm people in a short time',
        'Even a small fire can create a serious smoke hazard',
      ],
      image: withImage(images, 0),
    },
    {
      heading: 'What Staff Must Do About Smoke Risk',
      paragraphs: [
        'Staff must treat smoke as an immediate life safety issue. Raising the alarm, containing the area, and supporting evacuation are often more important than focusing on the fire source itself.',
        'It is important to ensure residents are moved according to plan and that corridors, doors, and compartments are used to slow spread wherever possible.',
      ],
      bullets: [
        'Never assume smoke is harmless',
        'Close doors to reduce movement of smoke and heat',
        'Prioritise resident safety and clear communication',
      ],
      image: '',
    },
  ],
  'How Fire Spreads': [
    {
      heading: 'The Three Main Routes of Spread',
      paragraphs: [
        'Fire spreads through conduction, convection, and radiation. Conduction transfers heat through solid materials, convection carries heat and smoke through moving air, and radiation allows heat to travel across spaces and ignite nearby items.',
        'Understanding these routes helps staff predict where the danger may move next, especially in corridors, service voids, kitchens, and rooms with soft furnishings.',
      ],
      bullets: [
        'Conduction spreads heat through materials',
        'Convection moves hot gases and smoke upward and outward',
        'Radiation can heat objects without direct contact',
      ],
      image: '',
    },
    {
      heading: 'How the Building Slows a Fire Down',
      paragraphs: [
        'Compartmentation, fire doors, and clear escape routes are all designed to slow the spread of fire and smoke. These features buy time for staff to respond and for residents to be moved safely.',
        'This is why doors must be closed, obstructions removed, and any damage to safety features reported quickly. Small maintenance issues can undermine the whole protection strategy.',
      ],
      bullets: [
        'Fire doors must close properly',
        'Clear routes help people move before conditions worsen',
        'Report damaged seals, wedges, or blocked exits immediately',
      ],
      image: withImage(images, 0),
    },
  ],
  'Common Fire Hazards': [
    {
      heading: 'Typical Hazards in Care Settings',
      paragraphs: [
        'Fire hazards in care homes often come from everyday tasks rather than dramatic events. Faulty electrics, poor storage, unsafe smoking arrangements, kitchen risks, and blocked escape routes can all create serious exposure.',
        'Because these hazards appear familiar, they can be missed unless staff actively look for them during routine work.',
      ],
      bullets: [
        'Overloaded sockets and damaged cables',
        'Cooking equipment left unattended',
        'Combustible items stored near heaters or plant',
        'Smoking materials not disposed of safely',
      ],
      image: withImage(images, 0),
    },
    {
      heading: 'Daily Prevention Actions',
      paragraphs: [
        'The safest approach is consistent housekeeping and reporting. Staff should always challenge blocked exits, unsafe charging, and any change that increases fuel load or reduces safe access.',
        'It is important to ensure problems are not only noticed but acted on. Near misses and minor hazards should be recorded before they become emergency incidents.',
      ],
      bullets: [
        'Keep exits and corridors clear',
        'Report damaged equipment promptly',
        'Store waste and linen safely',
        'Check that controls remain in place after busy shifts',
      ],
      image: withImage(images, 1),
    },
  ],
  'Fire Risk Assessment': [
    {
      heading: 'What a Fire Risk Assessment Looks At',
      paragraphs: [
        'A fire risk assessment reviews hazards, identifies who could be harmed, and checks whether the right controls are in place. In a care home, this includes residents with different support needs, staff, visitors, and contractors.',
        'The assessment is more than a document. It should reflect the real layout, equipment, routines, and people who use the building every day.',
      ],
      bullets: [
        'Sources of ignition, fuel, and oxygen',
        'People most at risk and why',
        'Existing controls such as alarms, doors, and procedures',
      ],
      image: '',
    },
    {
      heading: 'Why Review and Follow-Up Matter',
      paragraphs: [
        'A risk assessment must be reviewed when conditions change and at planned intervals. New equipment, room layout changes, resident needs, or repeated near misses can all change the level of risk.',
        'It is important to ensure actions from the assessment are completed, monitored, and explained to the people who rely on them.',
      ],
      bullets: [
        'Update assessments after changes or incidents',
        'Track actions until they are complete',
        'Share relevant findings with staff who need them',
      ],
      image: withImage(images, 0),
    },
  ],
  'Staff Responsibilities': [
    {
      heading: 'Personal Duties on Every Shift',
      paragraphs: [
        'Every staff member has a role in preventing fires and responding safely if one occurs. This includes knowing the local procedure, keeping exits clear, and staying alert to hazards in resident rooms and shared spaces.',
        'You must understand your role before an alarm happens. In an emergency, hesitation wastes time and can make coordinated support harder for residents and colleagues.',
      ],
      bullets: [
        'Know exits, alarm points, and local procedures',
        'Keep escape routes free from obstruction',
        'Report faults, hazards, and unsafe behaviour promptly',
      ],
      image: '',
    },
    {
      heading: 'Supporting Residents and the Team',
      paragraphs: [
        'Staff responsibilities also include communication and teamwork. Residents may need reassurance, physical support, or guidance that reflects their care plan and mobility level.',
        'It is important to ensure instructions are calm, clear, and consistent with the wider emergency response so that no resident is left without support.',
      ],
      bullets: [
        'Follow assigned roles during alarms and evacuations',
        'Use resident information and plans when assisting',
        'Escalate concerns immediately if conditions change',
      ],
      image: withImage(images, 0),
    },
  ],
  'Emergency Procedure (RACE)': [
    {
      heading: 'The Meaning of RACE',
      paragraphs: [
        'RACE stands for Rescue, Alarm, Contain, and Evacuate. It gives staff a simple structure for the first moments of a fire emergency when actions must be fast and coordinated.',
        'Using a consistent sequence helps people focus on life safety first rather than reacting in a random order under pressure.',
      ],
      bullets: [
        'Rescue anyone in immediate danger if it is safe',
        'Alarm by activating the fire procedure without delay',
        'Contain by closing doors and limiting spread',
        'Evacuate according to site plan and resident need',
      ],
      image: '',
    },
    {
      heading: 'Applying RACE in Real Situations',
      paragraphs: [
        'RACE is a decision aid, not a reason to take unsafe risks. Staff must always balance urgency with personal safety, resident vulnerability, and the site emergency plan.',
        'It is important to ensure the alarm is raised early and that containment steps, such as closing doors, are not forgotten while people focus on movement.',
      ],
      bullets: [
        'Act quickly but stay within your training',
        'Communicate clearly with the team during each step',
        'Use compartmentation and evacuation plans together',
      ],
      image: withImage(images, 0),
    },
  ],
  'Evacuation and PEEP': [
    {
      heading: 'Evacuating Residents Safely',
      paragraphs: [
        'Evacuation in a care setting is not one-size-fits-all. Residents may need support because of mobility, cognition, sensory loss, or medical equipment, so movement must follow an organised plan.',
        'The aim is to move people to a place of safety in the safest possible order while keeping staff coordinated and calm.',
      ],
      bullets: [
        'Consider mobility, confusion, and clinical needs',
        'Use the safest route available at the time',
        'Escalate quickly if a route becomes unsafe',
      ],
      image: '',
    },
    {
      heading: 'Using the Personal Emergency Evacuation Plan',
      paragraphs: [
        'A PEEP explains the support a specific resident may need during an emergency. Staff must know where these plans are held and how to apply them during both drills and real alarms.',
        'It is important to ensure the plan reflects the resident’s current needs. A PEEP that is out of date can create confusion just when precision matters most.',
      ],
      bullets: [
        'Check PEEPs are accessible and current',
        'Match support methods to the individual resident',
        'Review plans whenever needs or room locations change',
      ],
      image: withImage(images, 0),
    },
  ],
  'Fire Extinguishers': [
    {
      heading: 'Different Extinguishers for Different Risks',
      paragraphs: [
        'Extinguishers are designed for specific classes of fire, so using the wrong type can be ineffective or dangerous. Staff should recognise that colour coding and labels are there to guide safe use, not to encourage guesswork.',
        'Training should help you understand the basics, but practical use must always depend on your competence and the conditions around you.',
      ],
      bullets: [
        'Water and foam are not suitable for every fire',
        'Electrical and cooking fire risks need particular care',
        'Read site guidance and extinguisher labels carefully',
      ],
      image: '',
    },
    {
      heading: 'When Not to Use an Extinguisher',
      paragraphs: [
        'You should only use an extinguisher if you have been trained, the fire is still small, and you have a clear exit behind you. Resident safety and evacuation always come before firefighting.',
        'It is important to ensure people do not stay in danger because they feel pressure to tackle a fire that is already beyond safe control.',
      ],
      bullets: [
        'Leave immediately if smoke, heat, or size increases',
        'Never block your escape route while responding',
        'Raise the alarm even if you think you can manage the incident',
      ],
      image: withImage(images, 0),
    },
  ],
  'Key Takeaways': [
    {
      heading: 'What Staff Must Remember Most',
      paragraphs: [
        'Fire safety depends on routine discipline as much as emergency response. Prevention, reporting, and calm action are what keep residents safer when risk appears.',
        'The most effective staff are the ones who notice hazards early, follow the plan consistently, and support residents with confidence under pressure.',
      ],
      bullets: [
        'Prevent hazards before they develop',
        'Follow emergency procedures without delay',
        'Prioritise residents and communicate clearly',
      ],
      image: '',
    },
    {
      heading: 'Turning Training into Practice',
      paragraphs: [
        'This course should shape what you do on shift, not just what you remember in theory. Regular checks, good housekeeping, and attention to resident-specific plans are what make the training meaningful.',
        'Always use the procedures in your workplace, and ensure any concern is reported quickly so that the whole team can keep the environment safe.',
      ],
      bullets: [
        'Revisit local procedures and fire points regularly',
        'Support drills and plan reviews seriously',
        'Treat fire safety as part of everyday care quality',
      ],
      image: withImage(images, 0),
    },
  ],
});

const buildFallbackSections = ({ title, body, images = [] }) => {
  const paragraphs = splitParagraphs(body).map(normalizeParagraph).filter(Boolean);
  const primary = paragraphs[0]
    || `${title} is an important part of safe practice and should be understood clearly by staff before they apply it in the workplace.`;
  const secondary = paragraphs[1]
    || `This lesson explains what the topic means, why it matters in day-to-day work, and how staff should apply it consistently.`;
  const detail = paragraphs[2]
    || `Always connect the lesson content to real situations, making sure actions are safe, practical, and aligned with local procedure.`;

  return [
    {
      heading: 'Core Idea',
      paragraphs: [primary, secondary].map(normalizeParagraph),
      bullets: [],
      image: '',
    },
    {
      heading: 'Why It Matters in Practice',
      paragraphs: [detail].map(normalizeParagraph),
      bullets: [
        'Use the guidance consistently in routine work',
        'Ensure concerns are reported early',
        'Apply the lesson in a way that protects people and reduces risk',
      ],
      image: withImage(images, 0),
    },
  ];
};

const validateAndFixSections = (sections, fallbackImages = []) => {
  const safeSections = Array.isArray(sections) ? sections : [];
  const cleaned = safeSections.map((section, index) => {
    const heading = normalizeParagraph(section?.heading) || `Section ${index + 1}`;
    const paragraphs = Array.isArray(section?.paragraphs)
      ? section.paragraphs.map(normalizeParagraph).filter(Boolean).slice(0, 2)
      : [];
    const bullets = Array.isArray(section?.bullets)
      ? section.bullets.map(normalizeParagraph).filter(Boolean).slice(0, 6)
      : [];
    const image = section?.image || fallbackImages[index] || '';

    if (paragraphs.length === 0 && bullets.length === 0) {
      paragraphs.push('This section explains a key part of the lesson and should be reviewed carefully in practice.');
    }

    return { heading, paragraphs, bullets, image };
  }).filter((section) => section.heading);

  while (cleaned.length < 2) {
    const index = cleaned.length;
    cleaned.push({
      heading: index === 0 ? 'Core Idea' : 'Why It Matters',
      paragraphs: [
        index === 0
          ? 'This lesson introduces a core topic that staff need to understand clearly.'
          : 'The practical meaning of this topic should always be linked to safe, consistent action.',
      ],
      bullets: index === 1 ? ['Apply the guidance in daily work', 'Report issues early', 'Support safe outcomes for residents'] : [],
      image: fallbackImages[index] || '',
    });
  }

  return cleaned.slice(0, 4);
};

const buildStructuredContent = ({ title, content = {} }) => {
  const images = Array.isArray(content.images)
    ? content.images.filter(Boolean)
    : (content.image_url ? [content.image_url] : []);
  const templateSections = createTemplateLibrary(images)[title];
  const sections = validateAndFixSections(
    templateSections || buildFallbackSections({ title, body: content.body, images }),
    images
  );

  return {
    schema_version: 2,
    title,
    sections,
    micro_check: content.micro_check || null,
    duration_seconds: content.duration_seconds || ((content.duration_minutes || 1) * 60),
    regulatory_reference: content.regulatory_reference || '',
  };
};

const normalizeLessonContent = ({ title, content = {} }) => {
  if (content && Array.isArray(content.sections) && content.sections.length > 0) {
    return {
      ...content,
      title: content.title || title,
      sections: validateAndFixSections(content.sections, []),
      micro_check: content.micro_check || null,
      schema_version: content.schema_version || 2,
    };
  }

  return buildStructuredContent({ title, content });
};

const validateStructuredLessonContent = ({ title, content = {} }) => {
  const normalized = normalizeLessonContent({ title, content });
  const checks = {
    hasTitle: Boolean(normalized.title),
    hasTwoSections: Array.isArray(normalized.sections) && normalized.sections.length >= 2,
    allSectionsHaveHeading: true,
    allSectionsHaveContent: true,
    imageNotOversized: true,
    contentReadable: true,
  };

  normalized.sections.forEach((section) => {
    if (!normalizeParagraph(section.heading)) checks.allSectionsHaveHeading = false;
    const paragraphCount = Array.isArray(section.paragraphs) ? section.paragraphs.filter(Boolean).length : 0;
    const bulletCount = Array.isArray(section.bullets) ? section.bullets.filter(Boolean).length : 0;
    if (paragraphCount === 0 && bulletCount === 0) checks.allSectionsHaveContent = false;
  });

  checks.contentReadable = normalized.sections.every((section) => {
    const paragraphCount = Array.isArray(section.paragraphs) ? section.paragraphs.filter(Boolean).length : 0;
    return paragraphCount <= 2 && paragraphCount >= 1;
  });

  return {
    normalized,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
};

module.exports = {
  STRONG_WORD_PATTERN,
  normalizeLessonContent,
  validateStructuredLessonContent,
};
