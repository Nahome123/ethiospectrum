export const resourceCategoryValues = [
  "general",
  "healthcare",
  "education",
  "therapy",
  "benefits",
  "legal",
  "family_support",
  "other",
] as const;

export const resourceStatusValues = ["draft", "in_review", "published", "archived"] as const;
export const resourceReviewStatusValues = ["draft", "in_review", "approved"] as const;
export const resourceTypeValues = ["article", "guide", "video", "template", "event_recap"] as const;

export const MEMBER_RESOURCE_PAGE_SIZE = 12;

export type ResourceCategory = (typeof resourceCategoryValues)[number];
export type ResourceStatus = (typeof resourceStatusValues)[number];
export type ResourceReviewStatus = (typeof resourceReviewStatusValues)[number];
export type ResourceType = (typeof resourceTypeValues)[number];
