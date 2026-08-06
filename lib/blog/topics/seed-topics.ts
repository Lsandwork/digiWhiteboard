/** Seed topics — specific, useful angles for Fitdog’s Automatic Blog. */
export const BLOG_SEED_TOPICS: Array<{
  title: string;
  pillar: string;
  readerConcern: string;
  primaryTakeaway: string;
  angle: string;
  tonePreset: string;
  localRelevance?: string;
}> = [
  {
    title: "How to tell when your dog needs a break from group play",
    pillar: "daycare-education",
    readerConcern: "Owners worry their dog is overstimulated in daycare playgroups.",
    primaryTakeaway: "Watch for stress signals and support rest before exhaustion sets in.",
    angle: "Practical observation guide for daycare-style social play.",
    tonePreset: "daycare_education"
  },
  {
    title: "What a well-supervised daycare yard should look like",
    pillar: "daycare-education",
    readerConcern: "People choosing daycare want to know what responsible supervision looks like.",
    primaryTakeaway: "Supervision quality matters more than open space alone.",
    angle: "Transparent expectations for daycare environments.",
    tonePreset: "service_explanation"
  },
  {
    title: "Why some dogs need a slower introduction to daycare",
    pillar: "daycare-education",
    readerConcern: "Owners feel discouraged when a dog is not ready for full group play.",
    primaryTakeaway: "A slower start can protect confidence and create a better long-term fit.",
    angle: "Normalize gradual daycare evaluations.",
    tonePreset: "sensitive_owner_concern"
  },
  {
    title: "How to prepare a puppy for their first daycare evaluation",
    pillar: "puppy-care",
    readerConcern: "New puppy owners want the first evaluation to feel fair and calm.",
    primaryTakeaway: "Preparation is about comfort and readiness, not perfection.",
    angle: "Step-by-step puppy evaluation prep.",
    tonePreset: "new_puppy_support"
  },
  {
    title: "What to pack for your dog’s first boarding stay",
    pillar: "boarding-preparation",
    readerConcern: "Owners feel anxious about leaving their dog overnight.",
    primaryTakeaway: "A simple packing list and clear routine notes reduce stress for everyone.",
    angle: "Practical boarding packing + communication checklist.",
    tonePreset: "boarding_preparation"
  },
  {
    title: "Helping your dog settle after a busy daycare day",
    pillar: "enrichment",
    readerConcern: "Dogs come home wired and owners are unsure how to help them decompress.",
    primaryTakeaway: "Recovery routines matter as much as the activity itself.",
    angle: "Post-daycare settle habits.",
    tonePreset: "daycare_education"
  },
  {
    title: "Why rest matters just as much as exercise for active dogs",
    pillar: "enrichment",
    readerConcern: "Owners of high-energy dogs assume more exercise always helps.",
    primaryTakeaway: "A tired dog is not always a relaxed dog — rest skills matter.",
    angle: "Exercise vs recovery balance.",
    tonePreset: "training_advice"
  },
  {
    title: "How structured enrichment differs from simply keeping a dog busy",
    pillar: "enrichment",
    readerConcern: "Owners buy more toys but still see restless behavior.",
    primaryTakeaway: "Enrichment should match the dog’s needs, not just fill time.",
    angle: "Quality of enrichment over quantity.",
    tonePreset: "training_advice"
  },
  {
    title: "Signs your dog may be overwhelmed during social play",
    pillar: "training",
    readerConcern: "Owners struggle to tell play from stress.",
    primaryTakeaway: "Body language and recovery between interactions are key signals.",
    angle: "Readable social stress cues.",
    tonePreset: "sensitive_owner_concern"
  },
  {
    title: "How dogs communicate that they want more space",
    pillar: "training",
    readerConcern: "People miss polite distance signals until conflict appears.",
    primaryTakeaway: "Learning early space requests prevents escalation.",
    angle: "Dog-to-dog and dog-to-human communication.",
    tonePreset: "training_advice"
  },
  {
    title: "Questions to ask before booking overnight boarding",
    pillar: "boarding-preparation",
    readerConcern: "Choosing boarding feels overwhelming and high-stakes.",
    primaryTakeaway: "Ask about supervision, routines, rest, and communication — not just amenities.",
    angle: "Buyer’s guide rooted in care quality.",
    tonePreset: "boarding_preparation"
  },
  {
    title: "How to maintain your dog’s routine while you travel",
    pillar: "boarding-preparation",
    readerConcern: "Travel disrupts feeding, walks, and sleep.",
    primaryTakeaway: "Preserve a few anchors so the dog feels oriented.",
    angle: "Travel + boarding continuity.",
    tonePreset: "boarding_preparation"
  },
  {
    title: "Helping a newly adopted dog adjust without rushing them",
    pillar: "senior-rescue",
    readerConcern: "New adopters want connection quickly and fear doing it wrong.",
    primaryTakeaway: "Slow, predictable routines often build trust faster than forced affection.",
    angle: "Rescue adjustment without pressure.",
    tonePreset: "rescue_dog_adjustment"
  },
  {
    title: "Building leash skills during normal neighborhood walks",
    pillar: "training",
    readerConcern: "Formal training time feels scarce.",
    primaryTakeaway: "Short, consistent walk habits beat occasional long sessions.",
    angle: "Everyday leash practice.",
    tonePreset: "training_advice",
    localRelevance: "Santa Monica / Los Angeles neighborhood walks"
  },
  {
    title: "What to do when your dog is too excited to focus on walks",
    pillar: "training",
    readerConcern: "Excitement makes polite walking feel impossible.",
    primaryTakeaway: "Lower the difficulty and reward calm starts before distance.",
    angle: "Arousal management on walks.",
    tonePreset: "training_advice"
  },
  {
    title: "Why short training sessions often work better than long ones",
    pillar: "training",
    readerConcern: "Owners think longer practice equals faster progress.",
    primaryTakeaway: "Short, clear sessions protect focus and reduce frustration.",
    angle: "Session design for real households.",
    tonePreset: "training_advice"
  },
  {
    title: "Socialization does not mean meeting every dog",
    pillar: "puppy-care",
    readerConcern: "Puppy owners feel pressure to expose their dog to everything.",
    primaryTakeaway: "Quality and choice matter more than volume of meetings.",
    angle: "Reframe socialization.",
    tonePreset: "new_puppy_support"
  },
  {
    title: "Dog beach safety for Southern California owners",
    pillar: "outdoor-safety",
    readerConcern: "Beach days look fun but hide heat, salt, and overstimulation risks.",
    primaryTakeaway: "Plan shade, water, sand checks, and an exit plan.",
    angle: "Local beach practicality.",
    tonePreset: "seasonal_safety",
    localRelevance: "Southern California beaches"
  },
  {
    title: "How hot pavement affects dogs in Los Angeles",
    pillar: "outdoor-safety",
    readerConcern: "Owners underestimate sidewalk heat.",
    primaryTakeaway: "Test pavement, adjust timing, and protect paws.",
    angle: "LA heat + pavement safety.",
    tonePreset: "seasonal_safety",
    localRelevance: "Los Angeles"
  },
  {
    title: "Preparing your dog for an adventure hike",
    pillar: "outdoor-safety",
    readerConcern: "Hikes can overface dogs that are fit but underprepared.",
    primaryTakeaway: "Match distance, footing, and recovery to the individual dog.",
    angle: "Fitdog-style adventure readiness.",
    tonePreset: "service_explanation"
  },
  {
    title: "Helping puppies feel comfortable with grooming",
    pillar: "grooming",
    readerConcern: "First grooming experiences can create lifelong fear.",
    primaryTakeaway: "Short positive handling sessions at home support calmer appointments.",
    angle: "Grooming confidence for puppies.",
    tonePreset: "grooming_guidance"
  },
  {
    title: "How to prepare a nervous dog for a nail trim",
    pillar: "grooming",
    readerConcern: "Nail trims become battles.",
    primaryTakeaway: "Desensitization and cooperative care beat force.",
    angle: "Gentle nail-care preparation.",
    tonePreset: "grooming_guidance"
  },
  {
    title: "Helping senior dogs stay engaged without overexertion",
    pillar: "senior-rescue",
    readerConcern: "Older dogs still need stimulation but tire differently.",
    primaryTakeaway: "Shift toward shorter enrichment and comfortable movement.",
    angle: "Senior engagement design.",
    tonePreset: "senior_dog_care"
  },
  {
    title: "Creating a quiet space for your dog during celebrations",
    pillar: "seasonal-care",
    readerConcern: "Holidays overwhelm dogs with visitors and noise.",
    primaryTakeaway: "A planned retreat space is kindness, not exclusion.",
    angle: "Holiday calm planning.",
    tonePreset: "seasonal_safety"
  },
  {
    title: "What Fitdog staff observe during a daycare evaluation",
    pillar: "fitdog-services",
    readerConcern: "Owners want transparency about what “evaluation” means.",
    primaryTakeaway: "Evaluations look at comfort, communication, and fit — not perfection.",
    angle: "Honest Fitdog process explanation.",
    tonePreset: "service_explanation"
  },
  {
    title: "How Fitdog balances activity, enrichment, supervision, and rest",
    pillar: "fitdog-services",
    readerConcern: "People assume daycare is nonstop play.",
    primaryTakeaway: "Balanced days support safer, happier dogs.",
    angle: "Behind the scenes care philosophy.",
    tonePreset: "service_explanation"
  },
  {
    title: "How to decide between daycare, a hike, training, or a rest day",
    pillar: "fitdog-services",
    readerConcern: "Owners are unsure which activity their dog needs that day.",
    primaryTakeaway: "Match the day’s plan to energy, recovery, and emotional state.",
    angle: "Decision framework for active dogs.",
    tonePreset: "light_community_article"
  },
  {
    title: "Why sharing changes in your dog’s routine helps their care team",
    pillar: "fitdog-services",
    readerConcern: "Small home changes affect daycare/boarding behavior.",
    primaryTakeaway: "Clear updates help staff support your dog better.",
    angle: "Owner-care team communication.",
    tonePreset: "service_explanation"
  },
  {
    title: "Indoor enrichment ideas that do not require buying more toys",
    pillar: "enrichment",
    readerConcern: "Rainy days leave owners stuck and dogs restless.",
    primaryTakeaway: "Household items and scent games can be enough.",
    angle: "Low-cost enrichment.",
    tonePreset: "light_community_article"
  },
  {
    title: "Why progress in dog training is rarely perfectly linear",
    pillar: "training",
    readerConcern: "Owners feel discouraged when skills seem to slip.",
    primaryTakeaway: "Context changes and adolescence are normal parts of learning.",
    angle: "Normalize training plateaus.",
    tonePreset: "training_advice"
  },
  {
    title: "What dog owners should know before choosing a daycare",
    pillar: "daycare-education",
    readerConcern: "Choosing daycare feels high-stakes and hard to compare.",
    primaryTakeaway: "Look for supervision quality, matching practices, and honest communication.",
    angle: "Practical daycare selection criteria.",
    tonePreset: "daycare_education"
  },
  {
    title: "How to help a newly adopted dog adjust without rushing them",
    pillar: "senior-rescue",
    readerConcern: "Adopters fear they are doing too little or too much.",
    primaryTakeaway: "Predictable rest and gentle routines often beat forced bonding.",
    angle: "Decompression-first rescue support.",
    tonePreset: "rescue_dog_adjustment"
  },
  {
    title: "Why a predictable routine can help a rescue dog feel safer",
    pillar: "senior-rescue",
    readerConcern: "New environments feel chaotic for recently adopted dogs.",
    primaryTakeaway: "Consistent feeding, walks, and quiet time reduce uncertainty.",
    angle: "Routine as safety.",
    tonePreset: "rescue_dog_adjustment"
  },
  {
    title: "How to reward calm behavior without accidentally creating excitement",
    pillar: "training",
    readerConcern: "Praise and treats sometimes amp dogs up.",
    primaryTakeaway: "Match reward energy to the behavior you want to grow.",
    angle: "Calm reinforcement timing.",
    tonePreset: "training_advice"
  },
  {
    title: "What healthy socialization really means for puppies",
    pillar: "puppy-care",
    readerConcern: "Owners confuse exposure volume with quality learning.",
    primaryTakeaway: "Positive, controlled experiences matter more than meeting every dog.",
    angle: "Quality socialization framework.",
    tonePreset: "new_puppy_support"
  },
  {
    title: "How to prepare your dog for safe transportation",
    pillar: "fitdog-services",
    readerConcern: "Van and car rides can stress dogs who need daycare or adventures.",
    primaryTakeaway: "Comfort, secure loading, and predictable cues make travel easier.",
    angle: "Transport readiness without force.",
    tonePreset: "service_explanation"
  },
  {
    title: "Helping dogs feel comfortable getting into a van or car",
    pillar: "fitdog-services",
    readerConcern: "Loading becomes a daily struggle.",
    primaryTakeaway: "Break loading into small, rewarded steps.",
    angle: "Cooperative loading practice.",
    tonePreset: "training_advice"
  },
  {
    title: "Why active dogs still need help learning how to relax",
    pillar: "enrichment",
    readerConcern: "Fit dogs cannot settle at home.",
    primaryTakeaway: "Relaxation is a skill, not only a side effect of exercise.",
    angle: "Teach off-switch habits.",
    tonePreset: "training_advice"
  },
  {
    title: "How to use mealtime as enrichment",
    pillar: "enrichment",
    readerConcern: "Owners want enrichment without long setups.",
    primaryTakeaway: "Simple feeding puzzles can add mental work to ordinary meals.",
    angle: "Food-as-enrichment basics.",
    tonePreset: "light_community_article"
  },
  {
    title: "Easy scent games for rainy days",
    pillar: "enrichment",
    readerConcern: "Weather cancels outdoor plans and dogs get restless.",
    primaryTakeaway: "Short scent searches use the dog’s natural skills indoors.",
    angle: "Indoor nosework-style games.",
    tonePreset: "light_community_article"
  },
  {
    title: "How to rotate dog toys without overwhelming your dog",
    pillar: "enrichment",
    readerConcern: "Toy bins grow while interest fades.",
    primaryTakeaway: "Small rotations keep novelty without clutter.",
    angle: "Toy rotation systems.",
    tonePreset: "light_community_article"
  },
  {
    title: "What to bring on a dog-friendly beach day",
    pillar: "outdoor-safety",
    readerConcern: "Beach outings fail when owners forget basics.",
    primaryTakeaway: "Water, shade, rinse plans, and an exit cue matter as much as the beach itself.",
    angle: "Beach packing list with safety context.",
    tonePreset: "seasonal_safety",
    localRelevance: "Southern California"
  },
  {
    title: "How sand, salt water, and heat affect dogs",
    pillar: "outdoor-safety",
    readerConcern: "Owners notice irritation after beach trips.",
    primaryTakeaway: "Rinse, paw checks, and rest reduce common beach aftereffects.",
    angle: "Post-beach care.",
    tonePreset: "seasonal_safety"
  },
  {
    title: "Why hike difficulty should match the individual dog",
    pillar: "outdoor-safety",
    readerConcern: "Group hikes can push some dogs too far.",
    primaryTakeaway: "Age, conditioning, paws, and confidence should guide the route.",
    angle: "Individualized adventure planning.",
    tonePreset: "service_explanation"
  },
  {
    title: "What recovery should look like after a long dog hike",
    pillar: "outdoor-safety",
    readerConcern: "Dogs seem sore or wired after big outings.",
    primaryTakeaway: "Plan water, quiet rest, and a lighter next day.",
    angle: "Post-hike recovery.",
    tonePreset: "service_explanation"
  },
  {
    title: "Planning outdoor activities during Southern California heat",
    pillar: "outdoor-safety",
    readerConcern: "Warm weather makes timing confusing.",
    primaryTakeaway: "Earlier starts, shade, and shorter sessions protect dogs better than toughness.",
    angle: "Heat-aware planning.",
    tonePreset: "seasonal_safety",
    localRelevance: "Southern California"
  },
  {
    title: "Why water alone is not enough protection from overheating",
    pillar: "outdoor-safety",
    readerConcern: "Owners rely only on a water bottle.",
    primaryTakeaway: "Shade, pacing, and knowing early heat signs matter too.",
    angle: "Heat safety beyond hydration.",
    tonePreset: "seasonal_safety"
  },
  {
    title: "How to help a long-haired dog stay comfortable in warm weather",
    pillar: "grooming",
    readerConcern: "Coat care in heat feels confusing.",
    primaryTakeaway: "Brushing, smart timing, and professional guidance beat risky DIY shaving decisions.",
    angle: "Coat comfort in warm months.",
    tonePreset: "grooming_guidance"
  },
  {
    title: "When matting becomes more than a cosmetic issue",
    pillar: "grooming",
    readerConcern: "Mats seem cosmetic until they cause discomfort.",
    primaryTakeaway: "Mats can pull skin and hide irritation — address them early.",
    angle: "Coat health education.",
    tonePreset: "grooming_guidance"
  },
  {
    title: "Why regular brushing matters between grooming appointments",
    pillar: "grooming",
    readerConcern: "Owners wait for appointments to handle the coat.",
    primaryTakeaway: "Light home brushing protects comfort between visits.",
    angle: "Home grooming habits.",
    tonePreset: "grooming_guidance"
  },
  {
    title: "How coat type affects grooming needs",
    pillar: "grooming",
    readerConcern: "Generic grooming advice does not match every dog.",
    primaryTakeaway: "Coat type should guide tools, frequency, and professional support.",
    angle: "Coat-specific care.",
    tonePreset: "grooming_guidance"
  },
  {
    title: "Enrichment ideas for dogs with limited mobility",
    pillar: "senior-rescue",
    readerConcern: "Mobility limits make owners fear boredom.",
    primaryTakeaway: "Scent, food puzzles, and gentle social contact still count.",
    angle: "Low-impact enrichment.",
    tonePreset: "senior_dog_care"
  },
  {
    title: "How to adjust activities as your dog gets older",
    pillar: "senior-rescue",
    readerConcern: "Aging changes what a good day looks like.",
    primaryTakeaway: "Shorter sessions and more recovery keep seniors engaged safely.",
    angle: "Aging activity redesign.",
    tonePreset: "senior_dog_care"
  },
  {
    title: "What changes in behavior may mean your senior dog needs support",
    pillar: "senior-rescue",
    readerConcern: "Owners dismiss changes as “just old age.”",
    primaryTakeaway: "New restlessness, confusion, or pain signs deserve a veterinary conversation.",
    angle: "Senior observation guide with professional boundaries.",
    tonePreset: "health_conscious_guidance"
  },
  {
    title: "How to prepare your dog when moving to a new home",
    pillar: "seasonal-care",
    readerConcern: "Moves disrupt scent maps and routines.",
    primaryTakeaway: "Keep anchors familiar and introduce the new space gradually.",
    angle: "Moving with dogs.",
    tonePreset: "sensitive_owner_concern"
  },
  {
    title: "Helping a dog adjust to a new apartment",
    pillar: "local-guides",
    readerConcern: "Elevators, hallways, and thin walls create new stressors.",
    primaryTakeaway: "Practice building skills and protect quiet recovery time.",
    angle: "Apartment living transition.",
    tonePreset: "local_dog_owner_guide",
    localRelevance: "Los Angeles apartments"
  },
  {
    title: "Building a routine after a major household change",
    pillar: "seasonal-care",
    readerConcern: "Schedule upheaval shows up as clinginess or restlessness.",
    primaryTakeaway: "Reinstall a few predictable daily anchors quickly.",
    angle: "Household change recovery.",
    tonePreset: "sensitive_owner_concern"
  },
  {
    title: "Helping dogs cope when a family schedule changes",
    pillar: "seasonal-care",
    readerConcern: "School or work shifts leave dogs confused.",
    primaryTakeaway: "Gradual practice and enrichment reduce abrupt alone-time stress.",
    angle: "Schedule-change preparation.",
    tonePreset: "sensitive_owner_concern"
  },
  {
    title: "Preparing dogs for holiday visitors",
    pillar: "seasonal-care",
    readerConcern: "Guests overwhelm dogs who usually have a quiet home.",
    primaryTakeaway: "Practice greetings and give dogs a real opt-out space.",
    angle: "Visitor prep.",
    tonePreset: "seasonal_safety"
  },
  {
    title: "Helping dogs take breaks during busy gatherings",
    pillar: "seasonal-care",
    readerConcern: "Dogs get stuck in the middle of parties.",
    primaryTakeaway: "Scheduled breaks prevent overload better than waiting for a meltdown.",
    angle: "Event pacing for dogs.",
    tonePreset: "seasonal_safety"
  },
  {
    title: "What owners should know about dog-safe holiday foods",
    pillar: "seasonal-care",
    readerConcern: "Holiday tables create temptation and risk.",
    primaryTakeaway: "Keep unsafe foods out of reach and ask a veterinarian about concerns.",
    angle: "Holiday food safety with professional boundaries.",
    tonePreset: "health_conscious_guidance"
  },
  {
    title: "Why not every dog enjoys crowded dog-friendly events",
    pillar: "local-guides",
    readerConcern: "Owners feel pressure to take dogs everywhere.",
    primaryTakeaway: "Skipping an event can be the kindest choice for some dogs.",
    angle: "Permission to opt out.",
    tonePreset: "local_dog_owner_guide",
    localRelevance: "Los Angeles events"
  },
  {
    title: "How to decide whether an outing is right for your dog",
    pillar: "enrichment",
    readerConcern: "Owners struggle to tell enrichment from overload.",
    primaryTakeaway: "Use recovery afterward as feedback for the next plan.",
    angle: "Outing decision framework.",
    tonePreset: "training_advice"
  },
  {
    title: "Understanding the difference between exercise and enrichment",
    pillar: "enrichment",
    readerConcern: "Miles of walking still leave dogs restless.",
    primaryTakeaway: "Mental work and choice often settle dogs better than more mileage alone.",
    angle: "Exercise vs enrichment.",
    tonePreset: "training_advice"
  },
  {
    title: "Why a tired dog is not always a relaxed dog",
    pillar: "enrichment",
    readerConcern: "Exhaustion still shows up as hyperactivity.",
    primaryTakeaway: "Overarousal and true relaxation are different states.",
    angle: "Arousal education.",
    tonePreset: "training_advice"
  },
  {
    title: "Signs your dog may need more mental stimulation",
    pillar: "enrichment",
    readerConcern: "Destructive or restless behavior is hard to interpret.",
    primaryTakeaway: "Look for boredom patterns and add short, satisfying mental tasks.",
    angle: "Mental stimulation cues.",
    tonePreset: "training_advice"
  },
  {
    title: "How to help an adolescent dog through changing behavior",
    pillar: "training",
    readerConcern: "Teen dogs seem to forget everything.",
    primaryTakeaway: "Keep criteria clear and expectations realistic during adolescence.",
    angle: "Adolescent dog support.",
    tonePreset: "training_advice"
  },
  {
    title: "What to do when a previously learned behavior seems to disappear",
    pillar: "training",
    readerConcern: "Owners assume the dog is being stubborn.",
    primaryTakeaway: "Check context, reinforcement history, and difficulty before restarting.",
    angle: "Skill relapse troubleshooting.",
    tonePreset: "training_advice"
  },
  {
    title: "How to set realistic training goals for your dog",
    pillar: "training",
    readerConcern: "Goals become all-or-nothing and then stall.",
    primaryTakeaway: "Small measurable goals create steadier progress.",
    angle: "Goal setting for households.",
    tonePreset: "training_advice"
  },
  {
    title: "Why consistency matters more than perfection in dog training",
    pillar: "training",
    readerConcern: "Busy families feel they must do everything perfectly.",
    primaryTakeaway: "Clear, repeatable habits beat occasional intense sessions.",
    angle: "Consistency over perfection.",
    tonePreset: "training_advice"
  },
  {
    title: "How dog owners can avoid accidentally rewarding jumping",
    pillar: "training",
    readerConcern: "Jumping keeps happening despite corrections.",
    primaryTakeaway: "Attention timing often maintains the habit — change what gets reinforced.",
    angle: "Jumping reinforcement awareness.",
    tonePreset: "training_advice"
  },
  {
    title: "Teaching polite greetings without punishing excitement",
    pillar: "training",
    readerConcern: "Owners dislike harsh corrections for happy greetings.",
    primaryTakeaway: "Teach an alternate greeting and manage practice setups.",
    angle: "Polite greetings.",
    tonePreset: "training_advice"
  },
  {
    title: "What a dog training consultation should help you understand",
    pillar: "training",
    readerConcern: "People do not know what to expect from a consult.",
    primaryTakeaway: "A good consult clarifies goals, constraints, and next practice steps.",
    angle: "Transparent training consult expectations.",
    tonePreset: "service_explanation"
  },
  {
    title: "How daycare and training can support different needs",
    pillar: "fitdog-services",
    readerConcern: "Owners treat daycare as a substitute for training or vice versa.",
    primaryTakeaway: "Social exercise and skill learning solve different problems.",
    angle: "Service complementarity.",
    tonePreset: "service_explanation"
  },
  {
    title: "Why some dogs thrive in smaller playgroups",
    pillar: "daycare-education",
    readerConcern: "Bigger groups look more fun but may not fit every dog.",
    primaryTakeaway: "Play style and confidence should guide group size.",
    angle: "Playgroup matching.",
    tonePreset: "daycare_education"
  },
  {
    title: "How staff should match dogs by play style rather than size alone",
    pillar: "daycare-education",
    readerConcern: "Size-based grouping can miss important temperament differences.",
    primaryTakeaway: "Compatible play styles support safer, happier social time.",
    angle: "Responsible matching philosophy.",
    tonePreset: "daycare_education"
  },
  {
    title: "What responsible dog-to-dog introductions look like",
    pillar: "training",
    readerConcern: "On-leash greetings go sideways quickly.",
    primaryTakeaway: "Managed space, choice, and short sessions beat forced face-to-face hellos.",
    angle: "Introduction protocol education.",
    tonePreset: "training_advice"
  },
  {
    title: "Preparing your dog for their first Fitdog adventure",
    pillar: "fitdog-services",
    readerConcern: "First adventures feel exciting and uncertain.",
    primaryTakeaway: "Share habits, comfort cues, and health notes so the team can support your dog.",
    angle: "First adventure prep.",
    tonePreset: "service_explanation"
  },
  {
    title: "How dog owners and care teams can work together",
    pillar: "fitdog-services",
    readerConcern: "Communication gaps create mismatched expectations.",
    primaryTakeaway: "Clear updates about sleep, stress, and home changes improve care.",
    angle: "Partnership communication.",
    tonePreset: "service_explanation"
  },
  {
    title: "What information to provide before your dog stays overnight",
    pillar: "boarding-preparation",
    readerConcern: "Owners forget details that matter at night.",
    primaryTakeaway: "Feeding, meds, rest habits, and comfort items help staff support your dog.",
    angle: "Boarding intake checklist.",
    tonePreset: "boarding_preparation"
  },
  {
    title: "Why honest communication matters in dog care",
    pillar: "fitdog-services",
    readerConcern: "Owners hesitate to share behavior or medical nuances.",
    primaryTakeaway: "Honest context helps teams make safer, kinder decisions.",
    angle: "Trust and transparency.",
    tonePreset: "service_explanation"
  },
  {
    title: "Preparing for daycare evaluations with a sensitive dog",
    pillar: "daycare-education",
    readerConcern: "Sensitive dogs may shut down in busy environments.",
    primaryTakeaway: "Share triggers early and expect a paced introduction.",
    angle: "Sensitive-dog evaluation prep.",
    tonePreset: "sensitive_owner_concern"
  },
  {
    title: "How leash skills transfer from training class to real sidewalks",
    pillar: "training",
    readerConcern: "Skills work at home and fall apart outside.",
    primaryTakeaway: "Practice in gradually harder environments instead of jumping difficulty.",
    angle: "Generalization of leash skills.",
    tonePreset: "training_advice",
    localRelevance: "Santa Monica sidewalks"
  },
  {
    title: "Los Angeles dog-friendly outings that still leave room to rest",
    pillar: "local-guides",
    readerConcern: "Local outings become overstimulating marathons.",
    primaryTakeaway: "Choose destinations with shade, exits, and a recovery plan.",
    angle: "Local outing design.",
    tonePreset: "local_dog_owner_guide",
    localRelevance: "Los Angeles"
  },
  {
    title: "Santa Monica dog-owner guide to pacing busy weekends",
    pillar: "local-guides",
    readerConcern: "Weekend crowds stress dogs and owners.",
    primaryTakeaway: "Earlier timing and quieter routes often work better than peak hours.",
    angle: "Local pacing advice.",
    tonePreset: "local_dog_owner_guide",
    localRelevance: "Santa Monica"
  },
  {
    title: "What responsible supervision looks like in group dog care",
    pillar: "daycare-education",
    readerConcern: "Supervision is hard to evaluate from the outside.",
    primaryTakeaway: "Active observation and intervention readiness matter more than cameras alone.",
    angle: "Supervision transparency.",
    tonePreset: "daycare_education"
  },
  {
    title: "Helping dogs settle when life gets busier than usual",
    pillar: "enrichment",
    readerConcern: "Busy seasons leave dogs under-supported.",
    primaryTakeaway: "Protect a few non-negotiable calm routines.",
    angle: "Busy-season dog care.",
    tonePreset: "sensitive_owner_concern"
  },
  {
    title: "How to talk with your care team about separation concerns",
    pillar: "boarding-preparation",
    readerConcern: "Owners feel embarrassed about alone-time struggles.",
    primaryTakeaway: "Specific observations help teams support boarding and daycare transitions.",
    angle: "Separation concern communication.",
    tonePreset: "sensitive_owner_concern"
  },
  {
    title: "Building owner confidence without pretending every day is easy",
    pillar: "training",
    readerConcern: "Dog ownership advice online feels unrealistically polished.",
    primaryTakeaway: "Confidence grows from small wins and honest problem-solving.",
    angle: "Supportive owner mindset.",
    tonePreset: "sensitive_owner_concern"
  }
];
