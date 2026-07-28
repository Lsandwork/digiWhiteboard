import { fetchPackProTrainingProgress } from "@/lib/pack-pro/client";

async function main() {
  const result = await fetchPackProTrainingProgress();
  console.log(
    JSON.stringify(
      {
        groupId: result.groupId,
        learners: result.learners.length,
        sample: result.learners.slice(0, 3).map((learner) => ({
          name: learner.name,
          email: learner.email,
          courses: Object.fromEntries(learner.courses.map((course) => [course.course_title, course.percent]))
        })),
        incomplete: result.learners.filter((learner) => learner.courses.some((course) => course.percent < 100)).length
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
