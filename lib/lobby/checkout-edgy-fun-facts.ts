/**
 * Edgier / family-friendly checkout joke bank for the lobby spotlight.
 * Completely separate from the classic dry-humor TEMPLATES in checkout-spotlight-fun-facts.ts.
 */

export type CheckoutEdgyFunFactCategory =
  | "chaos_personality"
  | "double_entendre"
  | "dramatic_dog"
  | "social_life"
  | "fitness_zoomies"
  | "food_obsession"
  | "absurd_observation"
  | "pickup_release"
  | "weird_specific"
  | "confidence_attitude";

export type CheckoutFunFactRating = "pg" | "pg13";

export type CheckoutFunFactBank = "classic_dry_humor" | "edgy_family_friendly";

export type CheckoutFunFactEntry = {
  id: string;
  category: string;
  bank: CheckoutFunFactBank;
  rating: CheckoutFunFactRating;
  template: (name: string) => string;
};

function entry(
  id: string,
  category: CheckoutEdgyFunFactCategory,
  rating: CheckoutFunFactRating,
  template: (name: string) => string
): CheckoutFunFactEntry {
  return { id, category, bank: "edgy_family_friendly", rating, template };
}

function numbered(
  prefix: string,
  category: CheckoutEdgyFunFactCategory,
  rating: CheckoutFunFactRating,
  templates: Array<(name: string) => string>
): CheckoutFunFactEntry[] {
  return templates.map((template, index) =>
    entry(`${prefix}-${String(index + 1).padStart(3, "0")}`, category, rating, template)
  );
}

const CHAOS_PERSONALITY = numbered("edgy-chaos", "chaos_personality", "pg", [
  (n) => `${n} arrived innocent and immediately began proving otherwise.`,
  (n) => `${n} spent the day making excellent choices. None of them were calm.`,
  (n) => `${n} has the confidence of someone who has never once faced consequences.`,
  (n) => `${n} brought big “I know what I did” energy with absolutely no intention of explaining.`,
  (n) => `${n} somehow turned standing still into a full-contact activity.`,
  (n) => `${n} has mastered the art of being everywhere except where expected.`,
  (n) => `${n} woke up and chose violence. Fortunately, the cute kind.`,
  (n) => `${n} treats personal space like a suggestion written by cowards.`,
  (n) => `${n} spent today aggressively pursuing their own happiness.`,
  (n) => `${n} has never met a situation that couldn't benefit from more enthusiasm.`,
  (n) => `${n} operated at full volume despite nobody locating the volume knob.`,
  (n) => `${n} was born ready. Ready for what remains unclear.`,
  (n) => `${n} believes subtlety is something other dogs do.`,
  (n) => `${n} spent the day being suspiciously good at having a good time.`,
  (n) => `${n} has absolutely no indoor voice and no regrets about it.`,
  (n) => `${n} is proof that confidence does not require qualifications.`,
  (n) => `${n} made “too much” look like a personality trait.`,
  (n) => `${n} treats every entrance like a surprise appearance on live television.`,
  (n) => `${n} came in hot and never really cooled down.`,
  (n) => `${n} has been described as “a lot,” which is technically a compliment here.`
]);

const DOUBLE_ENTENDRE = numbered("edgy-double", "double_entendre", "pg13", [
  (n) => `${n} likes it rough. By “it,” we mean playtime. Obviously.`,
  (n) => `${n} spent the afternoon chasing tail and making questionable decisions.`,
  (n) => `${n} believes boundaries are meant to be sniffed before crossing.`,
  (n) => `${n} got plenty of action today and is absolutely exhausted.`,
  (n) => `${n} prefers a hands-on approach to making new friends.`,
  (n) => `${n} spent all day looking for trouble and somehow found it repeatedly.`,
  (n) => `${n} likes a good romp and refuses to apologize for it.`,
  (n) => `${n} was caught getting a little too excited in public.`,
  (n) => `${n} came, saw, sniffed… and stayed way longer than necessary.`,
  (n) => `${n} believes a little heavy breathing is part of a productive workout.`,
  (n) => `${n} has been putting their nose where it absolutely does not belong.`,
  (n) => `${n} enjoys long walks, dirty looks, and making things awkward.`,
  (n) => `${n} spent today getting sweaty with friends. Keep it classy.`,
  (n) => `${n} has no problem making the first move, especially toward snacks.`,
  (n) => `${n} prefers relationships that begin with intense sniffing.`,
  (n) => `${n} got physical today. Everyone involved had a great time.`,
  (n) => `${n} is a firm believer in vigorous outdoor activity.`,
  (n) => `${n} knows exactly how to get attention and isn't above using their body.`,
  (n) => `${n} spent the afternoon panting heavily and living their best life.`,
  (n) => `${n} likes their play sessions long, loud, and slightly inappropriate.`
]);

const DRAMATIC_DOG = numbered("edgy-dramatic", "dramatic_dog", "pg", [
  (n) => `${n} experienced several emotional events today, including being asked to wait.`,
  (n) => `${n} would like to formally announce that literally everything happened to them today.`,
  (n) => `${n} survived unimaginable hardship, including a closed door.`,
  (n) => `${n} spent part of the day staring into the distance like a retired detective.`,
  (n) => `${n} has requested a documentary about today's bravery.`,
  (n) => `${n} reacted to minor inconvenience with award-season intensity.`,
  (n) => `${n} would like everyone to respect their privacy during this difficult time of not getting their way.`,
  (n) => `${n} experienced betrayal today. Someone walked past without saying hello.`,
  (n) => `${n} has been emotionally unavailable since approximately 2:15 PM.`,
  (n) => `${n} spent the afternoon recovering from things that barely happened.`,
  (n) => `${n} believes every inconvenience deserves a dramatic pause.`,
  (n) => `${n} gave a performance so moving that nobody knew what was going on.`,
  (n) => `${n} has survived another day of unimaginable comfort.`,
  (n) => `${n} was personally offended by several events occurring near them.`,
  (n) => `${n} would like to thank everyone for their thoughts and prayers during snack time.`,
  (n) => `${n} has been through a lot today. Most of it was self-inflicted.`,
  (n) => `${n} turned one small disappointment into a three-act tragedy.`,
  (n) => `${n} is currently processing the fact that fun eventually has to end.`,
  (n) => `${n} has requested emotional compensation in the form of belly rubs.`,
  (n) => `${n} left nothing on the field except dignity. That disappeared early.`
]);

const SOCIAL_LIFE = numbered("edgy-social", "social_life", "pg", [
  (n) => `${n} made new friends faster than most adults make dinner plans.`,
  (n) => `${n} believes every stranger is simply a friend with incomplete paperwork.`,
  (n) => `${n} spent the day collecting acquaintances like Pokémon cards.`,
  (n) => `${n} has never understood the phrase “we just met.”`,
  (n) => `${n} made several connections and immediately forgot everyone's name.`,
  (n) => `${n} treats introductions as optional but friendship as mandatory.`,
  (n) => `${n} has a very active social life and contributes almost nothing to group conversations.`,
  (n) => `${n} was somehow both the life of the party and the reason it got loud.`,
  (n) => `${n} considers eye contact legally binding friendship.`,
  (n) => `${n} spent the day inserting themselves into conversations they were not invited to.`,
  (n) => `${n} believes every group activity needs one person making it weird.`,
  (n) => `${n} has never seen a circle of friends they didn't immediately join.`,
  (n) => `${n} made friends, enemies, and several confusing acquaintances before pickup.`,
  (n) => `${n} has excellent people skills for someone with zero understanding of personal boundaries.`,
  (n) => `${n} considers mutual sniffing a perfectly acceptable first date.`,
  (n) => `${n} was extremely popular today, mostly because they refused to leave anyone alone.`,
  (n) => `${n} believes networking works best at full speed.`,
  (n) => `${n} has a larger social calendar than most people with LinkedIn accounts.`,
  (n) => `${n} spent the day being aggressively approachable.`,
  (n) => `${n} doesn't make acquaintances. ${n} collects witnesses.`
]);

const FITNESS_ZOOMIES = numbered("edgy-fitness", "fitness_zoomies", "pg", [
  (n) => `${n} skipped cardio because apparently cardio skipped directly into them.`,
  (n) => `${n} completed enough laps to qualify for a minor infrastructure grant.`,
  (n) => `${n} turned exercise into an unsanctioned sporting event.`,
  (n) => `${n} believes cardio is easier when nobody tells you when to stop.`,
  (n) => `${n} spent the day training for absolutely nothing and taking it very seriously.`,
  (n) => `${n} discovered a new gear today. It was unnecessary but impressive.`,
  (n) => `${n} doesn't do warm-ups. ${n} simply begins at maximum capacity.`,
  (n) => `${n} has been moving like someone forgot to pay the electricity bill.`,
  (n) => `${n} burned enough energy today to power a small neighborhood.`,
  (n) => `${n} considers running in circles a valid form of self-improvement.`,
  (n) => `${n} trained hard, played harder, and will still sprint away at pickup.`,
  (n) => `${n} spent today proving that brakes are a luxury feature.`,
  (n) => `${n} has achieved peak athleticism without learning a single rule of any sport.`,
  (n) => `${n} ran like the rent was due.`,
  (n) => `${n} believes hydration is important, preferably after causing a scene.`,
  (n) => `${n} completed an intense workout consisting mostly of going absolutely nowhere.`,
  (n) => `${n} is leaving in excellent physical condition and questionable emotional condition.`,
  (n) => `${n} considers “one more lap” a lifestyle.`,
  (n) => `${n} did cardio until physics became optional.`
]);

const FOOD_OBSESSION = numbered("edgy-food", "food_obsession", "pg", [
  (n) => `${n} can hear food being imagined from another room.`,
  (n) => `${n} spent part of the day wondering why nobody was cooking specifically for them.`,
  (n) => `${n} maintains an open relationship with food. Very open.`,
  (n) => `${n} believes sharing is beautiful when other people are sharing with them.`,
  (n) => `${n} has never been hungry a day in their life but continues investigating.`,
  (n) => `${n} treats every rustling sound like a possible five-course meal.`,
  (n) => `${n} would like to remind everyone that meals are a social construct.`,
  (n) => `${n} has been thinking about dinner since yesterday's dinner.`,
  (n) => `${n} believes “not for dogs” is unnecessarily judgmental.`,
  (n) => `${n} has a complicated relationship with food: it's complicated because there isn't more of it.`,
  (n) => `${n} spent today casually checking whether anyone dropped anything edible.`,
  (n) => `${n} considers the floor an underrated restaurant.`,
  (n) => `${n} is not picky. ${n} is simply committed to quality control.`,
  (n) => `${n} believes crumbs deserve a second chance.`,
  (n) => `${n} would like to speak with whoever invented portion control.`,
  (n) => `${n} has been building character between meals and would prefer to stop.`,
  (n) => `${n} treats every smell like a restaurant review assignment.`,
  (n) => `${n} has never forgotten a meal and finds it concerning that you have.`,
  (n) => `${n} believes calories don't count if someone else drops them.`,
  (n) => `${n} is currently accepting applications for private chef.`
]);

const ABSURD_OBSERVATION = numbered("edgy-absurd", "absurd_observation", "pg", [
  (n) => `Fun fact: ${n} has no idea why they're famous but refuses to let it change them.`,
  (n) => `Fun fact: ${n} has achieved celebrity status among at least three people.`,
  (n) => `Fun fact: ${n} could absolutely explain today's events if they had words or accountability.`,
  (n) => `Fun fact: ${n} has been quietly building a fan base through unexplained confidence.`,
  (n) => `Fun fact: ${n} knows exactly what they're doing. This is the concerning part.`,
  (n) => `Fun fact: ${n} has a five-year plan but forgot it immediately.`,
  (n) => `Fun fact: ${n} is approximately 70% personality and 30% velocity.`,
  (n) => `Fun fact: ${n} believes consequences are something that happens to other dogs.`,
  (n) => `Fun fact: ${n} has never lost an argument because nobody understands the argument.`,
  (n) => `Fun fact: ${n} is fluent in side-eye, selective hearing, and sudden acceleration.`,
  (n) => `Fun fact: ${n} has an impressive ability to make silence feel suspicious.`,
  (n) => `Fun fact: ${n} treats rules like movie trailers—interesting, but not the full experience.`,
  (n) => `Fun fact: ${n} has never once wondered, “Should I?”`,
  (n) => `Fun fact: ${n} has excellent instincts and uses them irresponsibly.`,
  (n) => `Fun fact: ${n} is incredibly easy to love and moderately difficult to contain.`,
  (n) => `Fun fact: ${n} could be a genius. Nobody has the clearance to confirm it.`,
  (n) => `Fun fact: ${n} has made peace with being misunderstood and immediately misunderstood something else.`,
  (n) => `Fun fact: ${n} is exactly the reason cameras were invented.`,
  (n) => `Fun fact: ${n} has an incredible memory for things that benefit ${n}.`,
  (n) => `Fun fact: ${n} has never been late—time simply arrives too early.`
]);

const PICKUP_RELEASE = numbered("edgy-pickup", "pickup_release", "pg", [
  (n) => `${n} is excited to see you and has already forgotten everyone here.`,
  (n) => `${n} will now return home and pretend absolutely nothing happened.`,
  (n) => `Pickup has arrived. ${n}'s second shift of chaos begins shortly.`,
  (n) => `${n} is ready to go home and immediately inspect the refrigerator.`,
  (n) => `Please collect ${n} before they make another friend and refuse to leave.`,
  (n) => `${n} is heading home with tired legs and several suspicious stories.`,
  (n) => `Your dog is ready for pickup. Your furniture has been notified.`,
  (n) => `${n} has completed daycare and is prepared to sleep for seven minutes.`,
  (n) => `Congratulations. You've unlocked ${n}: After Hours Edition.`,
  (n) => `${n} is being released back into the community. Please act accordingly.`,
  (n) => `Pickup reminder: ${n} may appear tired. This is a temporary condition.`,
  (n) => `${n} is leaving with great memories and absolutely no intention of explaining them.`,
  (n) => `Your evening plans have been updated to include one extremely opinionated roommate.`,
  (n) => `${n} has been recharged, recalibrated, and returned to your care.`,
  (n) => `Thank you for attending today's episode of “What Was That Noise?” starring ${n}.`,
  (n) => `${n} is ready to go home and judge your driving from the back seat.`,
  (n) => `Please enjoy your complimentary evening zoomies, courtesy of ${n}.`,
  (n) => `${n} had a wonderful day and will now require a completely different level of attention.`,
  (n) => `Warning: ${n} may briefly act civilized during pickup. This is not a permanent update.`,
  (n) => `${n} is going home with one goal: make sure you know they had more fun than you did.`
]);

const WEIRD_SPECIFIC = numbered("edgy-weird", "weird_specific", "pg", [
  (n) => `${n} looked at the ceiling today like it knew something.`,
  (n) => `${n} spent several minutes trying to solve a problem nobody else could see.`,
  (n) => `${n} has been suspiciously interested in corners.`,
  (n) => `${n} briefly became convinced that the floor had changed.`,
  (n) => `${n} spent today checking whether reality still works the same way.`,
  (n) => `${n} stared into space long enough to make everyone uncomfortable.`,
  (n) => `${n} discovered something fascinating. Nobody else could find it.`,
  (n) => `${n} spent a concerning amount of time following an invisible agenda.`,
  (n) => `${n} has been conducting independent research with zero funding and questionable methodology.`,
  (n) => `${n} paused mid-play like they remembered an embarrassing story from 2017.`,
  (n) => `${n} made a face today that raised several unrelated questions.`,
  (n) => `${n} looked extremely busy despite accomplishing something impossible to identify.`,
  (n) => `${n} spent the afternoon acting like they were late for something.`,
  (n) => `${n} has been chasing a feeling and it appears to be winning.`,
  (n) => `${n} briefly forgot how doors work.`,
  (n) => `${n} approached a completely normal object with extraordinary suspicion.`,
  (n) => `${n} has seen things today. Mostly other dogs, but still.`,
  (n) => `${n} took a break from reality and nobody knows where they went.`,
  (n) => `${n} spent several minutes waiting for inspiration. Inspiration did not arrive.`,
  (n) => `${n} has been operating under a theory that remains classified.`
]);

const CONFIDENCE_ATTITUDE = numbered("edgy-confidence", "confidence_attitude", "pg", [
  (n) => `${n} walked in like the building had been waiting.`,
  (n) => `${n} does not ask for the room. ${n} assumes the room already agreed.`,
  (n) => `${n} has main-character energy and a supporting-actor attention span.`,
  (n) => `${n} treats compliments as overdue invoices.`,
  (n) => `${n} is not the boss. ${n} just acts like payroll already knows.`,
  (n) => `${n} arrived with a swagger that required no supporting evidence.`,
  (n) => `${n} has never once considered being the sidekick.`,
  (n) => `${n} believes the spotlight is a lifestyle, not a lighting choice.`,
  (n) => `${n} signed autographs today. The autographs were paw prints on staff.`,
  (n) => `${n} carries themselves like a rumor that turned out to be true.`,
  (n) => `${n} does not follow trends. Trends politely wait their turn.`,
  (n) => `${n} has the posture of someone who already won an argument nobody started.`,
  (n) => `${n} is humble in theory and extremely visible in practice.`,
  (n) => `${n} treats every hallway like a red carpet with worse flooring.`,
  (n) => `${n} has unshakable self-esteem and a very shakeable attention span.`,
  (n) => `${n} walked past a mirror and both parties seemed impressed.`,
  (n) => `${n} is leaving with the same confidence they arrived with, plus extra volume.`,
  (n) => `${n} does not need a hype person. ${n} is the hype person.`,
  (n) => `${n} believes low-key is a rumor started by quieter dogs.`,
  (n) => `${n} has been acting like the guest of honor at an event they also crashed.`
]);

export const EDGY_FAMILY_FRIENDLY_TEMPLATES: Record<
  CheckoutEdgyFunFactCategory,
  Array<(name: string) => string>
> = {
  chaos_personality: CHAOS_PERSONALITY.map((item) => item.template),
  double_entendre: DOUBLE_ENTENDRE.map((item) => item.template),
  dramatic_dog: DRAMATIC_DOG.map((item) => item.template),
  social_life: SOCIAL_LIFE.map((item) => item.template),
  fitness_zoomies: FITNESS_ZOOMIES.map((item) => item.template),
  food_obsession: FOOD_OBSESSION.map((item) => item.template),
  absurd_observation: ABSURD_OBSERVATION.map((item) => item.template),
  pickup_release: PICKUP_RELEASE.map((item) => item.template),
  weird_specific: WEIRD_SPECIFIC.map((item) => item.template),
  confidence_attitude: CONFIDENCE_ATTITUDE.map((item) => item.template)
};

export const EDGY_FAMILY_FRIENDLY_ENTRIES: CheckoutFunFactEntry[] = [
  ...CHAOS_PERSONALITY,
  ...DOUBLE_ENTENDRE,
  ...DRAMATIC_DOG,
  ...SOCIAL_LIFE,
  ...FITNESS_ZOOMIES,
  ...FOOD_OBSESSION,
  ...ABSURD_OBSERVATION,
  ...PICKUP_RELEASE,
  ...WEIRD_SPECIFIC,
  ...CONFIDENCE_ATTITUDE
];
