/**
 * Declarative expected pipeline / CRM outcomes for live user-story tests.
 * Imported by Vitest + runUserStoriesLive; passed into assertUs00xPipelineLive(ctx, expected).
 */

export type Us001LiveExpectation = {
  storyLabel: string;
  pipeline: {
    validActionsMin: number;
    createOrUpdateClientCount: number;
    createTaskMin: number;
    replyType: "actions";
  };
  client: {
    nameIncludesBoth: readonly [string, string];
    /** When the CRM row has a role, it must match (buyer); omitted role is OK for live LLM. */
    roleIfPresent: "buyer";
    budgetApprox: number;
    budgetTolerance: number;
    areasMustInclude: readonly string[];
    preferenceHintsMustAppearInJsonOrFeatures: readonly string[];
  };
  tasks: {
    minCount: number;
    combinedFollowUpHint: RegExp;
    combinedOptionsHint: RegExp;
  };
};

export const US_001_LIVE_EXPECTED: Us001LiveExpectation = {
  storyLabel: "US-001 live",
  pipeline: {
    validActionsMin: 3,
    createOrUpdateClientCount: 1,
    createTaskMin: 2,
    replyType: "actions",
  },
  client: {
    nameIncludesBoth: ["דניאל", "לוי"],
    roleIfPresent: "buyer",
    budgetApprox: 3_400_000,
    budgetTolerance: 150_000,
    areasMustInclude: ["גבעתיים", "רמת גן"],
    preferenceHintsMustAppearInJsonOrFeatures: ["מעלית", "חניה"],
  },
  tasks: {
    minCount: 2,
    combinedFollowUpHint: /מחר|11|אחזור|לחזור/i,
    combinedOptionsHint: /אופציות|שלוש|שליחה|הצעות|ערב/i,
  },
};

export type Us002LiveExpectation = {
  storyLabel: string;
  pipeline: {
    validActionsMin: number;
    minActionsByType: {
      create_or_update_client: number;
      create_or_update_property: number;
      create_task: number;
    };
    replyType: "actions";
  };
  client: {
    nameIncludesBoth: readonly [string, string];
    role: "owner";
    budgetApprox: number;
    budgetTolerance: number;
  };
  property: {
    addressMustIncludeAll: readonly string[];
    roomsApprox: number;
    roomsTolerance: number;
    askingPriceApprox: number;
    askingPriceTolerance: number;
    featuresCombinedPattern: RegExp;
    /** Both patterns must match the combined property notes + seller preferences JSON blob. */
    storyNotesMustMatchBoth: readonly [RegExp, RegExp];
    ownerClientNameIncludes: string;
  };
  tasks: {
    combinedMeetingContextPattern: RegExp;
    combinedDueTimePattern: RegExp;
  };
};

export const US_002_LIVE_EXPECTED: Us002LiveExpectation = {
  storyLabel: "US-002 live",
  pipeline: {
    validActionsMin: 3,
    minActionsByType: {
      create_or_update_client: 1,
      create_or_update_property: 1,
      create_task: 1,
    },
    replyType: "actions",
  },
  client: {
    nameIncludesBoth: ["מיכל", "כהן"],
    role: "owner",
    budgetApprox: 2_850_000,
    budgetTolerance: 200_000,
  },
  property: {
    addressMustIncludeAll: ["ביאליק", "23"],
    roomsApprox: 3.5,
    roomsTolerance: 0.51,
    askingPriceApprox: 2_850_000,
    askingPriceTolerance: 200_000,
    featuresCombinedPattern: /חניה|טאבו|קומה|מעלית|בלי/i,
    storyNotesMustMatchBoth: [/שוק|בדוק|מחיר/i, /בלעדיות|שווי|הערכ/i],
    ownerClientNameIncludes: "מיכל",
  },
  tasks: {
    combinedMeetingContextPattern: /פגישה|נכס|מיכל|קבוע/i,
    combinedDueTimePattern: /חמישי|אחר הצהריים/i,
  },
};

export type Us003LiveExpectation = {
  storyLabel: string;
  pipeline: {
    validActionsMin: number;
    minCreateOrUpdateClient: number;
    minCreateTask: number;
    replyType: "actions";
  };
  buyer: {
    nameIncludes: string;
    heat: {
      allowedLeadTemperatures: readonly ("warm" | "hot")[];
      /** Any interaction row counts as sufficient “warm” signal when temps match neither. */
      interactionsCountHeatIfPositive: boolean;
      hesitationOrThinkingPattern: RegExp;
    };
    feedbackBlobMustInclude: readonly string[];
    kitchenConcernSubstring: string;
    priceObjectionPattern: RegExp;
  };
  listing: {
    /** Every regex must match `FakeProperty.address`. */
    addressMustMatchAll: readonly RegExp[];
    structuralRowOnlyNoDetails: true;
  };
  tasks: {
    minCount: number;
    tomorrowPattern: RegExp;
    eveningPattern: RegExp;
    mustReferenceBuyerPattern: RegExp;
  };
  demo: {
    calendarMinEntries: number;
  };
};

export const US_003_LIVE_EXPECTED: Us003LiveExpectation = {
  storyLabel: "US-003 live",
  pipeline: {
    validActionsMin: 2,
    minCreateOrUpdateClient: 1,
    minCreateTask: 1,
    replyType: "actions",
  },
  buyer: {
    nameIncludes: "איתי",
    heat: {
      allowedLeadTemperatures: ["warm", "hot"],
      interactionsCountHeatIfPositive: true,
      hesitationOrThinkingPattern: /מתלבט|מתעניין|חושב/i,
    },
    feedbackBlobMustInclude: ["סלון", "חניה"],
    kitchenConcernSubstring: "מטבח",
    priceObjectionPattern: /150|מאה|אלף|פער|גבוה|יקר|מחיר/i,
  },
  listing: {
    addressMustMatchAll: [/הירדן/, /12/],
    structuralRowOnlyNoDetails: true,
  },
  tasks: {
    minCount: 1,
    tomorrowPattern: /מחר/i,
    eveningPattern: /ערב/i,
    mustReferenceBuyerPattern: /איתי/i,
  },
  demo: {
    calendarMinEntries: 1,
  },
};

export type Us004LiveExpectation = {
  storyLabel: string;
  turn1: {
    replyType: "clarification";
    clarificationPatterns: readonly RegExp[];
    taskCountMax: number;
  };
  turn2: {
    replyType: "actions";
    chosenClientNameIncludes: readonly [string, string];
    tasksMinCount: number;
    taskDueHint: RegExp;
    taskTitleHints: readonly RegExp[];
  };
};

export const US_004_LIVE_EXPECTED: Us004LiveExpectation = {
  storyLabel: "US-004 live",
  turn1: {
    replyType: "clarification",
    clarificationPatterns: [/יש כמה לקוחות בשם יוסי|יש.*יוסי|למי התכוונת/, /יוסי כהן/, /יוסי ביטון/],
    taskCountMax: 0,
  },
  turn2: {
    replyType: "actions",
    chosenClientNameIncludes: ["יוסי", "כהן"],
    tasksMinCount: 1,
    taskDueHint: /מחר/i,
    taskTitleHints: [/חזור|לחזור|פולואפ|התקשר|עדכן|מחר|רמת\s*גן|דירה/i],
  },
};
