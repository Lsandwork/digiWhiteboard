export const PACK_PRO_REQUIRED_COURSES = [
  { id: 27214, slug: "group_management", title: "Group Management" },
  { id: 26778, slug: "leadership_team_management", title: "Leadership & Team Management" },
  { id: 22442, slug: "canine_health_first_aid_cpr", title: "Canine Health - First Aid & CPR" },
  { id: 16401, slug: "new_dog_evaluation", title: "New Dog Evaluation" },
  { id: 8127, slug: "dog_body_language", title: "Dog Body Language" },
  { id: 8124, slug: "customer_service_basics", title: "Customer Service Basics" }
] as const;

export type PackProCourseSlug = (typeof PACK_PRO_REQUIRED_COURSES)[number]["slug"];
export type PackProCourseId = (typeof PACK_PRO_REQUIRED_COURSES)[number]["id"];

export const PACK_PRO_COURSE_BY_ID = Object.fromEntries(
  PACK_PRO_REQUIRED_COURSES.map((course) => [course.id, course])
) as Record<PackProCourseId, (typeof PACK_PRO_REQUIRED_COURSES)[number]>;

export const PACK_PRO_COURSE_BY_SLUG = Object.fromEntries(
  PACK_PRO_REQUIRED_COURSES.map((course) => [course.slug, course])
) as Record<PackProCourseSlug, (typeof PACK_PRO_REQUIRED_COURSES)[number]>;

export const PACK_PRO_BASE_URL = "https://packprotraining.com";
export const PACK_PRO_GROUP_ID_DEFAULT = 27330;
