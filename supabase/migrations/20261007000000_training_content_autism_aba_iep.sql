-- Training content from three family-education sources:
--   Autism_Awareness_Amharic_English.pptx -> "Understanding neurodivergency" (existing module)
--   ABA_at_Home_Training_March18.pptx       -> new module "ABA therapy at home"
--   IEP-504-Accommodations-EN-AM.docx       -> new module "IEP and 504 accommodations"
-- English is the main text and the sources' Amharic is the Amharic version.
-- New modules and lessons are drafts: an administrator reviews and publishes
-- them from Admin > Training content. Running this twice adds nothing.

do $$
declare
  course uuid;
  neuro uuid;
  aba uuid;
  iep uuid;
begin
  select id into course from public.training_courses where slug = 'rbt-boot-camp';
  if course is null then
    raise notice 'RBT Boot Camp course not found; training content not added.';
    return;
  end if;

  select id into neuro from public.training_modules
  where course_id = course and title = 'Understanding neurodivergency';
  if neuro is null then
    insert into public.training_modules (course_id, title, description, localized, status, sequence)
    values (course, 'Understanding neurodivergency', 'Foundations for parents and caregivers.',
      '{"am": {"title": "ኒውሮዳይቨርጀንሲን መረዳት"}, "es": {"title": "Comprender la neurodivergencia"}}'::jsonb, 'draft', 10)
    returning id into neuro;
  end if;

  -- Autism awareness lessons
  if not exists (select 1 from public.training_lessons where module_id = neuro and title = $t$What is autism?$t$) then
    insert into public.training_lessons (module_id, title, description, body, localized, duration_minutes, status, sequence)
    values (neuro, $t$What is autism?$t$, $t$Autism spectrum disorder explained, and why every child is different.$t$,
      $t$Autism Spectrum Disorder (ASD) is a neurodevelopmental condition.

• Children experience the world differently
• Challenges in social communication
• Repetitive behaviors or routines
• Sensory differences (over/under sensitivity)

Every child is unique — it's a spectrum.$t$,
      $t${"am": {"title": "አውቲዝም ምንድን ነው?", "description": "የአውቲዝም ስፔክትረም መታወክ ማብራሪያ፣ እና እያንዳንዱ ልጅ ለምን የተለየ እንደሆነ።", "body": "አውቲዝም (Autism Spectrum Disorder - ASD) የአንጎል እድገት ሂደት ነው።\n\n• ህፃናት ዓለምን ሌላ መንገድ ይቀበሉታል\n• ከሌሎች ጋር መነጋገር ይቸገራሉ\n• ተደጋጋሚ ድርጊቶች ያሳያሉ\n• ስሜቶቻቸው በተለየ ሁኔታ ይሰሩ ይሆናል\n\nምልክቱ ከሰው ሰው ይለያያል — ስፔክትረም ነው።"}}$t$::jsonb,
      5, 'draft', 110);
    insert into public.training_lessons (module_id, title, description, body, localized, duration_minutes, status, sequence)
    values (neuro, $t$Early signs to watch for$t$, $t$Developmental signs at 6, 12, 18 and 24 months that are worth raising with a doctor.$t$,
      $t$• 6 months: no social smiling
• 12 months: no pointing, no response to name
• 18 months: no single words spoken
• 24 months: no two-word phrases

Early detection = early support. Always consult a specialist.$t$,
      $t${"am": {"title": "ምልክቶች ቀደም ብሎ መለየት", "description": "በ6፣ 12፣ 18 እና 24 ወር ለሐኪም ማሳወቅ የሚገባቸው የእድገት ምልክቶች።", "body": "• 6 ወር፡ ፈገግ አይልም\n• 12 ወር፡ አይጠቁምም፣ ስሙ ሲጠራ አይዞርም\n• 18 ወር፡ ምንም ቃላት የለም\n• 24 ወር፡ ሁለት ቃላት አያዋህድም\n\nቀደም ብሎ መለየት = ቀደምት ድጋፍ"}}$t$::jsonb,
      5, 'draft', 120);
    insert into public.training_lessons (module_id, title, description, body, localized, duration_minutes, status, sequence)
    values (neuro, $t$Myths, taboo and stigma in our community$t$, $t$Common beliefs about autism, what is actually true, and what changes when a community understands autism.$t$,
      $t$Myth: "It is the evil eye or a curse."
Truth: Autism is a neurological difference — not supernatural or a punishment.

Myth: "The parents are to blame."
Truth: No parent is at fault. Genetics and environment play a role — never parenting.

Myth: "They are doing it on purpose."
Truth: Autistic children cannot fully control their responses. They need support, not punishment.

From ignorance to awareness

Without awareness:
• Children go undiagnosed
• Families feel shame or guilt
• Children are punished, not supported
• Therapy begins too late
• The community excludes the child and family

With awareness:
• Early diagnosis is possible
• Families receive support and resources
• Children thrive with proper support
• Therapy starts early = better outcomes
• The community embraces every child$t$,
      $t${"am": {"title": "ተሳሳቱ እምነቶችና ስህተቶች", "description": "ስለ አውቲዝም የተለመዱ እምነቶች፣ እውነታው፣ እና ማህበረሰቡ ሲገነዘብ ምን እንደሚለወጥ።", "body": "የተሳሳተ እምነት፡ \"ዓይነ ጥላ ወይም ክፉ ዓይን ነው\"\nእውነታው፡ አውቲዝም የአንጎል ልዩ ሁኔታ ነው — ትንቁ ወይም መለኮታዊ ቅጣት አይደለም።\n\nየተሳሳተ እምነት፡ \"ወላጆቹ ጥፋተኞች ናቸው\"\nእውነታው፡ ምንም ወላጅ ጥፋተኛ አይደለም። ምክንያቱ ጂን እና አካባቢ ናቸው።\n\nየተሳሳተ እምነት፡ \"ህፃናቱ ሆን ብለው ያደርጋሉ\"\nእውነታው፡ አውቲስቲክ ህፃናት ስሜቶቻቸውን እና ምላሾቻቸውን ሊቆጣጠሩ አይችሉም።\n\nግንዛቤ ማዳበር\n\nያለ ግንዛቤ፡\n• ህፃናት ትክክለኛ ምርመራ አያገኙም\n• ቤተሰቦች ተበደሉ ወይም ሃፈሩ ይሰማቸዋል\n• ህፃናቱ ቅጣት ይቀበላሉ\n• ሕክምና ዘግይቶ ይጀምራል\n• ማህበረሰቡ ሊቀበለው ይቸገራል\n\nባለ ግንዛቤ፡\n• ቀደምት ምርመራ ይቻላል\n• ቤተሰቦች ድጋፍ ያገኛሉ\n• ህፃናቱ ይደሰታሉ፣ ያድጋሉ\n• ቴራፒ ቶሎ ይጀምራል\n• ማህበረሰቡ ያቅፋቸዋል"}}$t$::jsonb,
      8, 'draft', 130);
    insert into public.training_lessons (module_id, title, description, body, localized, duration_minutes, status, sequence)
    values (neuro, $t$How families can help$t$, $t$Practical first steps for families, from early screening to connecting with others.$t$,
      $t$• Seek early screening from a pediatrician
• Accept and embrace your child fully
• Request an IEP at school (Individualized Education Program)
• Start therapy: ABA, speech, occupational therapy
• Connect with other families — you are not alone
• Educate yourself — knowledge is power

Our child is different — not less.
• Be the voice for your child
• Consult a developmental pediatrician
• Start therapy as early as possible
• Educate our community
• Love and patience change everything$t$,
      $t${"am": {"title": "ቤተሰቦች ምን ማድረግ ይችላሉ?", "description": "ከቀደምት ምርመራ እስከ ከሌሎች ጋር መገናኘት ድረስ ለቤተሰቦች ተግባራዊ የመጀመሪያ እርምጃዎች።", "body": "• ምልክቱን ቀደም ብሎ ይፈልጉ\n• ህፃናቱን ያቅፏቸው፣ ይቀበሏቸው\n• ለትምህርት ቤት IEP ይጠይቁ\n• ቴራፒ ያስጀምሩ — ABA፣ Speech፣ OT\n• ከሌሎች ቤተሰቦች ጋር ይተባበሩ\n• እናቁ — ዕውቀት ኃይል ነው\n\nልጃችን ልዩ ነው — ያልተሳሳተ።\n• ለልጃችሁ ድምፅ ሁኑ\n• ሐኪም ያማክሩ\n• ቴራፒ ያስጀምሩ\n• ማህበረሰቡን አስተምሩ\n• ፍቅርና ትዕግስት"}}$t$::jsonb,
      5, 'draft', 140);
  end if;

  -- ABA therapy at home
  select id into aba from public.training_modules where course_id = course and title = 'ABA therapy at home';
  if aba is null then
    insert into public.training_modules (course_id, title, description, localized, status, sequence)
    values (course, 'ABA therapy at home',
      'What RBTs and BCBAs do, and how families can support ABA therapy at home.',
      $t${"am": {"title": "ቤት ውስጥ ABA", "description": "RBT/BCBA የሚያደርጉትን ቤት ውስጥ መደገፍ"}}$t$::jsonb, 'draft', 30)
    returning id into aba;
    insert into public.training_lessons (module_id, title, description, body, localized, duration_minutes, status, sequence)
    values (aba, $t$Who are RBTs and BCBAs?$t$, $t$The two professionals on an ABA team and what each one does.$t$,
      $t$RBT — Registered Behavior Technician
Direct therapy provider; implements treatment plans written by the BCBA; collects data on every session.
• Provides direct therapy with children
• Carries out the program the BCBA designs
• Runs DTT, NET and behavior reduction
• Records everything (data collection)

BCBA — Board Certified Behavior Analyst
Designs behavior plans, supervises RBTs, conducts assessments, and trains families.
• Assesses the child
• Designs the therapy program
• Leads and supervises RBTs
• Trains families$t$,
      $t${"am": {"title": "RBT እና BCBA ማን ናቸው?", "description": "በABA ቡድን ውስጥ ያሉት ሁለቱ ባለሙያዎች እና እያንዳንዳቸው የሚያደርጉት።", "body": "RBT — Registered Behavior Technician\n• ቀጥታ ቴራፒ ህፃናት ጋር ያካሂዳሉ\n• BCBA ያዘጋጀውን ፕሮግራም ይፈጽማሉ\n• DTT, NET, Behavior Reduction ያካሂዳሉ\n• ሁሉን ነገር ይዘግባሉ (Data collection)\n\nBCBA — Board Certified Behavior Analyst\n• ህፃናቱን ይገመግማሉ (Assessment)\n• ቴራፒ ፕሮግራም ያዘጋጃሉ\n• RBT ይመራሉ እና ይቆጣጠራሉ\n• ቤተሰቦቹን ያሰለጥናሉ"}}$t$::jsonb,
      5, 'draft', 10);
    insert into public.training_lessons (module_id, title, description, body, localized, duration_minutes, status, sequence)
    values (aba, $t$Key ABA techniques at home$t$, $t$Six techniques families can use at home: DTT, NET, reinforcement, visual schedules, prompting and behavior reduction.$t$,
      $t$DTT — Discrete Trial Training
Teach one skill at a time using structured trials: give instruction → wait for response → reward immediately.

NET — Natural Environment Training
Teach in real-life settings: kitchen, playground, bedtime. Use natural opportunities to build skills.

Positive reinforcement
Immediately reward desired behavior — praise, food, a toy, or screen time. The sooner the better.

Visual schedules
Use picture schedules on the wall. Predictability reduces anxiety and meltdowns significantly.

Prompting and fading
Help when needed (physical, gestural, verbal prompts) then gradually reduce support until independent.

Behavior reduction
Identify the function of challenging behavior. Teach a replacement behavior. Never punish — redirect.$t$,
      $t${"am": {"title": "ዋና ዋና ABA ቴክኒኮች", "description": "ቤተሰቦች ቤት ውስጥ ሊጠቀሙባቸው የሚችሉ ስድስት ቴክኒኮች።", "body": "DTT — Discrete Trial Training\nደረጃ በደረጃ ማስተማር። አንድ ሥራ ብቻ ካርድ ወይም መጫዋቻ ተጠቅሞ ያስተምሩ። ምሳሌ: \"ዓይን ዓይን ዓይን — ጥሩ!\"\n\nNET — Natural Environment Training\nፈጥሮዊ ቦታዎች ላይ ማስተማር — ወጥ ቤት፣ ጓሮ፣ ጨዋታ ወቅት። \"ውሃ ፈልጎ ካለ → ጠይቅ → ስጥ\"\n\nPositive Reinforcement\nጥሩ ሥራ ሲሰሩ ወዲያው ሸለምዋቸው — ምግብ፣ ምስጋና፣ ጨዋታ። ጊዜ አያስፈልግም — ወዲያው!\n\nVisual Schedules\nየቀን ሥርዓት ምስሎችን ብዛቸው አቅርቡ። ህፃናቱ ቀጥሎ ምን እንደሚሆን ሲያዩ ያረጋጋሉ።\n\nPrompting & Fading\nአስፈላጊ ሲሆን እርዱ — ቀስ ብሎ እርዳታን ቀንሱ። ግብ: ልጁ ብቻ ማድረግ ነው።\n\nBehavior Reduction\nክፉ ሥራ ሲሆን → ምክንያቱን ፈልጉ → ምልካሚ ሥራ አስቀምጡ። አትቀጡ!"}}$t$::jsonb,
      10, 'draft', 20);
    insert into public.training_lessons (module_id, title, description, body, localized, duration_minutes, status, sequence)
    values (aba, $t$A daily home practice routine$t$, $t$A simple morning-to-evening routine for practicing skills at home.$t$,
      $t$Morning
• Visual schedule review
• Greeting practice
• Breakfast: "I want ___" (requesting)

Daytime
• 10-minute DTT session (1 target skill)
• Play + NET (colors, shapes, verbs)
• Sensory break as needed

After school
• Social story reading
• Sibling play interaction
• Functional communication practice

Evening
• Dinner: mand (requesting) training
• Hygiene routine with prompts
• Bedtime visual schedule$t$,
      $t${"am": {"title": "ቤት ውስጥ ዕለታዊ ልምምድ", "description": "ቤት ውስጥ ክህሎቶችን ለመለማመድ ከጠዋት እስከ ምሽት ቀላል የዕለት ተዕለት ሥርዓት።", "body": "ጠዋት\n• Visual schedule review\n• Greeting practice\n• Breakfast: \"I want___\" (requesting)\n\nቀን\n• 10-min DTT session (1 target skill)\n• Play + NET (color/shapes/verbs)\n• Sensory break as needed\n\nከት/ቤት\n• Social story reading\n• Sibling play interaction\n• Functional communication practice\n\nምሽት\n• Dinner: mand training\n• Hygiene routine with prompts\n• Bedtime visual schedule"}}$t$::jsonb,
      5, 'draft', 30);
    insert into public.training_lessons (module_id, title, description, body, localized, duration_minutes, status, sequence)
    values (aba, $t$Do's and don'ts at home$t$, $t$What helps, and what to avoid, when supporting your child at home.$t$,
      $t$Do
• Reinforce immediately — within 2-3 seconds of the behavior
• Use short, clear instructions (1-2 words)
• Keep a predictable daily routine
• Generalize skills taught in therapy
• Give processing time — wait 5-10 seconds

Don't
• Never use physical punishment
• Don't force eye contact — offer it naturally
• Avoid long explanations during meltdowns
• Don't give the reward before the behavior
• Don't rely only on therapy sessions$t$,
      $t${"am": {"title": "ማድረግ / ያለ ማድረግ", "description": "ልጅዎን ቤት ውስጥ ሲደግፉ የሚረዳው እና መወገድ ያለበት።", "body": "ማድረግ ያለብዎት\n• ወዲያው ሸልሙ (Reinforce immediately)\n• ቀላል፣ ግልጽ ቋንቋ ተጠቀሙ\n• የቀን ሥርዓት ያዙ (Routine)\n• ቴራፒስቱ ያለውን ቀጥሉ\n• አደናቅፎ ከምታደርጉ ጊዜ ስጡ\n\nማድረግ የሌለብዎት\n• አትቀጡ — ቁጣ አይጠቅምም\n• ጸጥ ትሎ ቢቀር አትበሳጩ\n• ረዥም ዓረፍተ ነገር አትናገሩ\n• ሁሉን ነገር ወዲያው አታቀርቡ\n• ብቻ ወደ ቴራፒስት አትጣሉ"}}$t$::jsonb,
      5, 'draft', 40);
    insert into public.training_lessons (module_id, title, description, body, localized, duration_minutes, status, sequence)
    values (aba, $t$Tracking progress at home$t$, $t$Simple ways to record behavior at home and share it with your child's team.$t$,
      $t$As parents, simple tracking helps your child's team!

Frequency count
How many times did the behavior occur today? (Use tally marks: ||||)

Duration
How long did the tantrum, task, or engagement last?

ABC data
A = Antecedent (what happened before) | B = Behavior | C = Consequence (what happened after)

Prompt level
Did your child do it independently (I), with a gesture (G), or with physical help (P)? Track independence daily!

Share your notes weekly with the therapist.

YOU are your child's most important therapist!
• Generalize therapy at home every day
• Track progress with simple notes
• Communicate weekly with your child's team
• Consistency + love = real progress
• You are never alone — our community is here$t$,
      $t${"am": {"title": "Data ቤት ውስጥ መከታተል", "description": "ቤት ውስጥ ባህሪን የመመዝገቢያ ቀላል መንገዶች እና ከልጅዎ ቡድን ጋር ማጋራት።", "body": "እንደ RBT ቤት ውስጥ ትንሽ data መሰብሰብ ቴራፒን ያጠናክራል።\n\nFrequency Count / ቁጥር\nህፃናቱ ምን ያህል ጊዜ አደረጉ?\n\nDuration / ጊዜ\nስንት ደቂቃ ቆያ?\n\nABC Data / ABC ፎርም\nA = ቅድሚያ (Antecedent) | B = ሥራ (Behavior) | C = ምን ሆነ (Consequence)\n\nPrompt Level / እርዳታ ደረጃ\nብቻ ሠሩ (I)? ፍንጭ (G)? አካላዊ (P)?\n\nሳምንት አንዴ data ቴራፒስቱ ጋር ያካፍሉ — ይህ ህፃናቱን ፈጥኖ ያሳድጋቸዋል!\n\nልጃችሁ ቤተሰቡ ቀዳሚ ቴራፒስቱ ነው!\n• ቴራፒ ቴክኒኮችን ቤት ውስጥ ቀጥሉ\n• ትንሽ data ይሰብስቡ\n• ቴራፒስቱ ጋር ይነጋገሩ\n• ትዕግስት + ወጥነት = ለውጥ\n• ብቻዎ አይደሉም"}}$t$::jsonb,
      8, 'draft', 50);
  end if;

  -- IEP and 504 accommodations
  select id into iep from public.training_modules where course_id = course and title = 'IEP and 504 accommodations';
  if iep is null then
    insert into public.training_modules (course_id, title, description, localized, status, sequence)
    values (course, 'IEP and 504 accommodations',
      $t$Example accommodations that may be included in a child's IEP or 504 Plan — a starting point for conversations with your child's school team.$t$,
      $t${"am": {"title": "ለ IEP እና ለ504 ናሙና ማመቻቻዎች", "description": "ልዩ ፍላጎት ላላቸው ልጆቻቸው ትምህርት የሚያመቻቹ የኢትዮጵያ ቤተሰቦች የሁለት ቋንቋ መመሪያ"}}$t$::jsonb, 'draft', 40)
    returning id into iep;
    insert into public.training_lessons (module_id, title, description, body, localized, duration_minutes, status, sequence)
    values (iep, $t$Classroom and learning environment$t$, $t$Changes to seating, space, noise and materials that help a child learn in the classroom.$t$,
      $t$This list offers examples of accommodations that may be included in a child's IEP (Individualized Education Program) or 504 Plan. Every child is different — use this as a starting point for conversations with your child's school team.

Classroom / Learning Environment
• Keep the workspace clean and clear of unrelated materials
• Provide additional personal space between desks
• Keep the classroom or learning area quiet during intense learning times
• Post a visual schedule on the student's desk
• Reduce visual distractions in the classroom/learning environment
• Use a pass system for students needing frequent movement breaks
• Provide a computer for written work
• Provide headsets to block noise
• Seat the student close to the teacher or a positive role model
• Provide FM or a sound-field amplification system for listening
• Use a study carrel (in a classroom environment, provide extra carrels so the student will not feel singled out)
• Provide accessible classroom locations and accessible furniture (such as desks, tables, wobble chairs, etc.)
• Seat the student away from windows, doorways, and radiators
• Provide organizers for lockers/desk
• Provide a clear view of the board, teacher, and screen
• Provide assistance when moving between classrooms or around the building
• Keep extra materials (pencils, paper, erasers, rulers) on hand
• Allow the student to leave the classroom 2-3 minutes early to avoid crowded hallways
• Provide preferential seating for visual, auditory, or behavioral needs
• Allow for small group and/or individual administration
• Allow the use of assistive technology

Source: Undivided, "Example Accommodations for IEPs and 504s" (www.undivided.io). Amharic translation prepared for Ethiopian community families.$t$,
      $t${"am": {"title": "የክፍል ውስጥ እና የመማሪያ አካባቢ", "description": "ልጅ በክፍል ውስጥ እንዲማር የሚረዱ የመቀመጫ፣ የቦታ፣ የድምጽ እና የቁሳቁስ ለውጦች።", "body": "ይህ ዝርዝር በልጅዎ IEP (የግለሰብ የትምህርት ፕሮግራም) ወይም በ504 ዕቅድ ውስጥ ሊካተቱ የሚችሉ የማመቻቻ ምሳሌዎችን ያቀርባል። እያንዳንዱ ልጅ የተለየ ነው — ይህንን ከልጅዎ ትምህርት ቤት ቡድን ጋር ለሚደረግ ውይይት እንደ መነሻ ይጠቀሙበት።\n\nየክፍል ውስጥ / የመማሪያ አካባቢ\n• የስራ ቦታውን ንፁህ እና ካልተዛመዱ ቁሳቁሶች ነፃ ያድርጉት\n• በዴስኮች መካከል ተጨማሪ የግል ቦታ ይስጡ\n• በጥልቅ የመማሪያ ጊዜያት ክፍሉን ወይም የመማሪያ ቦታውን ጸጥ ያድርጉት\n• በተማሪው ዴስክ ላይ የእይታ መርሃ ግብር ይለጥፉ\n• በክፍል/በመማሪያ አካባቢ ውስጥ ትኩረት የሚከፋፍሉ ነገሮችን ይቀንሱ\n• ተደጋጋሚ የእንቅስቃሴ እረፍት ለሚያስፈልጋቸው ተማሪዎች የፍቃድ ስርዓት ይጠቀሙ\n• ለጽሑፍ ስራ ኮምፒዩተር ይስጡ\n• ድምጽን ለመከልከል ሄድሴት ይስጡ\n• ተማሪውን ከመምህሩ ወይም ጥሩ አርአያ ከሆነ ተማሪ አጠገብ ያስቀምጡ\n• ለማዳመጥ የFM ወይም የድምጽ ማጉያ ስርዓት ያቅርቡ\n• የጥናት ካሬል ይጠቀሙ (በክፍል ውስጥ ተማሪው እንዳይለይ ተጨማሪ ካሬሎችን ያቅርቡ)\n• ተደራሽ የመማሪያ ክፍል ቦታዎችን እና ተደራሽ የቤት እቃዎችን ያቅርቡ (እንደ ዴስኮች፣ ጠረጴዛዎች፣ የሚነቃነቁ ወንበሮች፣ ወዘተ)\n• ተማሪውን ከመስኮቶች፣ ከበሮች እና ከማሞቂያዎች ርቆ ያስቀምጡ\n• ለሎከሮች/ዴስክ አደራጆችን ያቅርቡ\n• ወደ ሰሌዳው፣ መምህሩ እና ስክሪኑ ግልጽ እይታ ያቅርቡ\n• በክፍሎች መካከል ወይም በሕንፃው ውስጥ ሲንቀሳቀሱ እርዳታ ያቅርቡ\n• ተጨማሪ ቁሳቁሶችን (እርሳሶች፣ ወረቀት፣ ማጥፊያዎች፣ መስመሮች) በእጅ ይኑሩ\n• ተማሪው የተጨናነቁ ኮሪደሮችን ለማስወገድ ከክፍል 2-3 ደቂቃ ቀደም ብሎ እንዲወጣ ይፍቀዱ\n• ለእይታ፣ ለመስማት ወይም ለባህሪ ፍላጎቶች ተመራጭ መቀመጫ ያቅርቡ\n• ለትንሽ ቡድን እና/ወይም ለግለሰብ አስተዳደር ይፍቀዱ\n• የድጋፍ ቴክኖሎጂ አጠቃቀምን ይፍቀዱ\n\nምንጭ፡ Undivided፣ \"Example Accommodations for IEPs and 504s\" (www.undivided.io)። የአማርኛ ትርጉም ለኢትዮጵያ ማህበረሰብ ቤተሰቦች ተዘጋጅቷል።"}}$t$::jsonb,
      7, 'draft', 10);
    insert into public.training_lessons (module_id, title, description, body, localized, duration_minutes, status, sequence)
    values (iep, $t$Directions, textbooks and assignments$t$, $t$Ways to adapt how directions are given, how reading material is provided, and how assignments are set.$t$,
      $t$This list offers examples of accommodations that may be included in a child's IEP (Individualized Education Program) or 504 Plan. Every child is different — use this as a starting point for conversations with your child's school team.

Curriculum — Directions
• Use both oral and printed directions
• Highlight key words in directions
• Give directions in small steps using as few words as possible
• Show a model of the end product (such as a completed math problem or finished quiz)
• Number and sequence steps in a task
• Provide visual aids
• Allow the use of a tape recorder or assistive technology device to record directions
• Stand near the student when giving directions and cue the student that it's time to pay attention
• Have the student repeat the directions to check for comprehension
• Clarify/simplify/repeat directions

Curriculum — Textbooks
• Provide a summary of each chapter
• Explore the use of assistive technology
• Ask peer readers to read questions or passages aloud
• Provide audiotapes of textbooks — have the student follow the text while listening
• Use a marker to highlight important information in textbook sections
• Provide interesting reading material at or slightly above the student's comfortable reading level
• Provide two sets of classroom curriculum materials: one for home and one for school
• Use word-for-word sentence fill-ins
• Provide the student with a list of discussion questions before reading the material
• Use index cards to record major themes
• Provide books and other written materials in alternate formats such as Braille, large print, audio formats, and digital text
• Give page numbers to help the student find answers
• Provide alternative books with similar concepts, but at an easier reading level

Curriculum — Assignments
• Provide a vocabulary list
• Shorten assignments to focus on mastery of key concepts
• Substitute alternatives for long writing assignments (such as clay models, posters, panoramas, collections, electronic presentations, or oral presentations)
• Give alternatives to long written reports (for example, write several short reports, preview new audio-visual materials and write a short review, or give an oral report on an assigned topic)
• Provide alternatives to reading aloud in front of the class
• Shorten spelling tests to focus on mastering the most functional words
• Specify and list exactly what the student will need to learn; review this frequently
• Mask (block or white out) unnecessary content (such as navigational buttons, menu, additional questions, etc.) so students can focus on the assignment one step at a time

Source: Undivided, "Example Accommodations for IEPs and 504s" (www.undivided.io). Amharic translation prepared for Ethiopian community families.$t$,
      $t${"am": {"title": "መመሪያዎች፣ የመማሪያ መጽሐፍት እና ስራዎች", "description": "መመሪያዎች የሚሰጡበትን፣ የንባብ ቁሳቁስ የሚቀርብበትን እና ስራዎች የሚዘጋጁበትን መንገድ ማመቻቸት።", "body": "ይህ ዝርዝር በልጅዎ IEP (የግለሰብ የትምህርት ፕሮግራም) ወይም በ504 ዕቅድ ውስጥ ሊካተቱ የሚችሉ የማመቻቻ ምሳሌዎችን ያቀርባል። እያንዳንዱ ልጅ የተለየ ነው — ይህንን ከልጅዎ ትምህርት ቤት ቡድን ጋር ለሚደረግ ውይይት እንደ መነሻ ይጠቀሙበት።\n\nስርዓተ ትምህርት — መመሪያዎች\n• የቃል እና የተጻፉ መመሪያዎችን ይጠቀሙ\n• በመመሪያዎች ውስጥ ቁልፍ ቃላትን ያደምቁ\n• በተቻለ መጠን ጥቂት ቃላትን በመጠቀም መመሪያዎችን በትንንሽ ደረጃዎች ይስጡ\n• የመጨረሻውን ውጤት ናሙና ያሳዩ (እንደ የተጠናቀቀ የሂሳብ ችግር ወይም የተጠናቀቀ ፈተና)\n• በአንድ ስራ ውስጥ ያሉትን ደረጃዎች ቁጥር እና ቅደም ተከተል ይስጡ\n• የእይታ እርዳታዎችን ያቅርቡ\n• መመሪያዎችን ለመቅዳት የቴፕ መቅረጫ ወይም የድጋፍ ቴክኖሎጂ መሳሪያ አጠቃቀምን ይፍቀዱ\n• መመሪያ ሲሰጡ ከተማሪው አጠገብ ይቁሙ እና ትኩረት የመስጠት ጊዜ መሆኑን ምልክት ይስጡ\n• ግንዛቤን ለማረጋገጥ ተማሪው መመሪያዎቹን እንዲደግም ያድርጉ\n• መመሪያዎችን ግልጽ ያድርጉ/ያቅልሉ/ይድገሙ\n\nስርዓተ ትምህርት — የመማሪያ መጽሐፍት\n• የእያንዳንዱን ምዕራፍ ማጠቃለያ ያቅርቡ\n• የድጋፍ ቴክኖሎጂ አጠቃቀምን ያስሱ\n• የክፍል ጓደኞች ጥያቄዎችን ወይም ምንባቦችን ጮክ ብለው እንዲያነቡ ይጠይቁ\n• የመማሪያ መጽሐፍት ኦዲዮ ቴፖችን ያቅርቡ — ተማሪው እያዳመጠ ጽሑፉን እንዲከታተል ያድርጉ\n• በመማሪያ መጽሐፍ ክፍሎች ውስጥ ጠቃሚ መረጃን ለማድመቅ ማርከር ይጠቀሙ\n• ተማሪው ምቾት በሚሰማው የንባብ ደረጃ ወይም በትንሹ ከዚያ በላይ አስደሳች የንባብ ቁሳቁስ ያቅርቡ\n• ሁለት ስብስቦች የክፍል ውስጥ ስርዓተ ትምህርት ቁሳቁሶችን ያቅርቡ፡ አንዱ ለቤት አንዱ ለትምህርት ቤት\n• ቃል በቃል የዓረፍተ ነገር ሙሌቶችን ይጠቀሙ\n• ቁሳቁሱን ከማንበብ በፊት ለተማሪው የውይይት ጥያቄዎች ዝርዝር ያቅርቡ\n• ዋና ዋና ጭብጦችን ለመመዝገብ የመረጃ ካርዶችን ይጠቀሙ\n• መጽሐፍትን እና ሌሎች የተጻፉ ቁሳቁሶችን በአማራጭ ቅርጸቶች ያቅርቡ እንደ ብሬይል፣ ትልቅ ህትመት፣ የኦዲዮ ቅርጸቶች እና ዲጂታል ጽሑፍ\n• ተማሪው መልሶችን እንዲያገኝ ለመርዳት የገጽ ቁጥሮችን ይስጡ\n• ተመሳሳይ ፅንሰ-ሀሳቦች ያላቸው ግን በቀላል የንባብ ደረጃ ያሉ አማራጭ መጽሐፍትን ያቅርቡ\n\nስርዓተ ትምህርት — የቤት/የክፍል ስራዎች\n• የቃላት ዝርዝር ያቅርቡ\n• ቁልፍ ፅንሰ-ሀሳቦችን በደንብ ለመቆጣጠር ትኩረት ለመስጠት ስራዎችን ያሳጥሩ\n• ለረጅም የጽሑፍ ስራዎች አማራጮችን ይተኩ (እንደ የሸክላ ሞዴሎች፣ ፖስተሮች፣ ፓኖራማዎች፣ ስብስቦች፣ ኤሌክትሮኒክ ማቅረቢያዎች ወይም የቃል ማቅረቢያዎች)\n• ለረጅም የጽሑፍ ሪፖርቶች አማራጮችን ይስጡ (ለምሳሌ፣ ብዙ አጫጭር ሪፖርቶችን መጻፍ፣ አዲስ የኦዲዮ-ቪዥዋል ቁሳቁሶችን አስቀድሞ መመልከት እና አጭር ግምገማ መጻፍ፣ ወይም በተመደበ ርዕስ ላይ የቃል ሪፖርት መስጠት)\n• በክፍል ፊት ጮክ ብሎ ከማንበብ ይልቅ አማራጮችን ያቅርቡ\n• በጣም ጠቃሚ የሆኑ ቃላትን በደንብ ለመቆጣጠር ትኩረት ለመስጠት የፊደል አጻጻፍ ፈተናዎችን ያሳጥሩ\n• ተማሪው በትክክል መማር ያለበትን ነገር ይግለጹ እና ዘርዝሩ፤ ይህንን በተደጋጋሚ ይገምግሙ\n• አላስፈላጊ ይዘትን ይሸፍኑ (እንደ የአሰሳ አዝራሮች፣ ምናሌ፣ ተጨማሪ ጥያቄዎች፣ ወዘተ) ተማሪዎች በአንድ ጊዜ በአንድ ደረጃ ላይ ትኩረት እንዲያደርጉ\n\nምንጭ፡ Undivided፣ \"Example Accommodations for IEPs and 504s\" (www.undivided.io)። የአማርኛ ትርጉም ለኢትዮጵያ ማህበረሰብ ቤተሰቦች ተዘጋጅቷል።"}}$t$::jsonb,
      10, 'draft', 20);
    insert into public.training_lessons (module_id, title, description, body, localized, duration_minutes, status, sequence)
    values (iep, $t$Math and time$t$, $t$Math supports and extra time for transitions, tasks and homework.$t$,
      $t$This list offers examples of accommodations that may be included in a child's IEP (Individualized Education Program) or 504 Plan. Every child is different — use this as a starting point for conversations with your child's school team.

Curriculum — Math
• Allow the student to use a calculator without penalty if needed
• Read and explain story problems or break problems into smaller steps
• Group similar problems together (such as addition in one section, unless testing to see if the student can determine which function to use)
• Provide fewer problems on a worksheet (for example, 4 to 6 problems per page rather than 20 or 30, but keep the same total number of problems)
• Tape a number line to the student's desk
• Use pictures or graphics
• Use enlarged graph paper to help the student keep numbers in columns
• Circle math computation signs
• Provide a table or chart of math facts for reference (unless testing math facts)
• Require the student to solve fewer problems to focus on mastery of concepts

Curriculum — Time
• Alert the student several minutes before a transition from one activity to another
• Allow a specified amount of extra time to turn in homework without penalty
• Provide additional time to complete a task
• Provide a visual timer
• Increase wait time for responses

Source: Undivided, "Example Accommodations for IEPs and 504s" (www.undivided.io). Amharic translation prepared for Ethiopian community families.$t$,
      $t${"am": {"title": "ሂሳብ እና ጊዜ", "description": "የሂሳብ ድጋፎች እና ለሽግግሮች፣ ለስራዎች እና ለቤት ስራ ተጨማሪ ጊዜ።", "body": "ይህ ዝርዝር በልጅዎ IEP (የግለሰብ የትምህርት ፕሮግራም) ወይም በ504 ዕቅድ ውስጥ ሊካተቱ የሚችሉ የማመቻቻ ምሳሌዎችን ያቀርባል። እያንዳንዱ ልጅ የተለየ ነው — ይህንን ከልጅዎ ትምህርት ቤት ቡድን ጋር ለሚደረግ ውይይት እንደ መነሻ ይጠቀሙበት።\n\nስርዓተ ትምህርት — ሂሳብ\n• አስፈላጊ ከሆነ ተማሪው ያለቅጣት ካልኩሌተር እንዲጠቀም ይፍቀዱ\n• የታሪክ ችግሮችን ያንብቡ እና ያብራሩ ወይም ችግሮችን ወደ ትናንሽ ደረጃዎች ይክፈሉ\n• ተመሳሳይ ችግሮችን አንድ ላይ ያድርጉ (እንደ መደመር በአንድ ክፍል ውስጥ፣ ተማሪው የትኛውን ተግባር መጠቀም እንዳለበት መወሰን ይችል እንደሆነ ለመፈተሽ ካልሆነ በስተቀር)\n• በስራ ወረቀት ላይ ያነሱ ችግሮችን ያቅርቡ (ለምሳሌ፣ በገጽ ከ20 ወይም 30 ይልቅ ከ4 እስከ 6 ችግሮች፣ ነገር ግን ተመሳሳይ ጠቅላላ የችግሮች ብዛት ይኑር)\n• የቁጥር መስመርን በተማሪው ዴስክ ላይ ይለጥፉ\n• ስዕሎችን ወይም ግራፊክስን ይጠቀሙ\n• ተማሪው ቁጥሮችን በአምዶች ውስጥ እንዲያስቀምጥ ለመርዳት የተስፋፋ የግራፍ ወረቀት ይጠቀሙ\n• የሂሳብ ስሌት ምልክቶችን ያክብቡ\n• ለማጣቀሻ የሂሳብ እውነታዎች ሠንጠረዥ ወይም ገበታ ያቅርቡ (የሂሳብ እውነታዎችን የሚፈትኑ ካልሆነ በስተቀር)\n• ተማሪው ፅንሰ-ሀሳቦችን በደንብ ለመቆጣጠር ትኩረት እንዲያደርግ ያነሱ ችግሮችን እንዲፈታ ይጠይቁ\n\nስርዓተ ትምህርት — ጊዜ\n• ከአንድ እንቅስቃሴ ወደ ሌላ ከመሸጋገሩ ጥቂት ደቂቃዎች በፊት ተማሪውን ያስጠንቅቁ\n• ያለቅጣት የቤት ስራን ለማስረከብ የተወሰነ ተጨማሪ ጊዜ ይፍቀዱ\n• አንድን ስራ ለማጠናቀቅ ተጨማሪ ጊዜ ያቅርቡ\n• የእይታ ሰዓት ቆጣሪ ያቅርቡ\n• ለምላሾች የመጠበቅ ጊዜን ይጨምሩ\n\nምንጭ፡ Undivided፣ \"Example Accommodations for IEPs and 504s\" (www.undivided.io)። የአማርኛ ትርጉም ለኢትዮጵያ ማህበረሰብ ቤተሰቦች ተዘጋጅቷል።"}}$t$::jsonb,
      5, 'draft', 30);
    insert into public.training_lessons (module_id, title, description, body, localized, duration_minutes, status, sequence)
    values (iep, $t$Tests and grading$t$, $t$Testing conditions, formats and grading approaches that let a child show what they know.$t$,
      $t$This list offers examples of accommodations that may be included in a child's IEP (Individualized Education Program) or 504 Plan. Every child is different — use this as a starting point for conversations with your child's school team.

Test-Taking and Grading — Tests
• Allow for extended time to take the test
• Go over directions orally
• Allow the student to bring and take necessary medications such as an inhaler during the exam
• Have someone transfer answers to Scantron bubble sheets or record dictated notes and essays
• Provide wheelchair-accessible testing stations
• Offer the student study guides and questions that directly relate to the test
• Provide a distraction-free room
• Provide sample or practice tests ahead of time
• Provide Braille or large-print exam booklets
• Allow screen-reading technology
• Have a scribe read materials to the student and take notes for the student
• Divide tests into small sections of similar questions and problems
• Allow oral responses, access to speech-to-text support, and a scribe for dictation of written responses
• Permit the student to do an independent project as an alternative to a test
• Allow for testing over multiple days
• Provide test breaks
• Use a familiar proctor/test administrator
• Allow signed administration for students who are Deaf or hard of hearing
• Allow student to read aloud to self before selecting answers
• Provide paper format of test otherwise administered digitally
• Provide pre-recorded audio delivery for assessments, such as audiocassette tapes, CD-ROMs, audio DVDs, screen reader, etc.
• Mask (block or white out) unnecessary content so students can focus on one question at a time

Test-Taking and Grading — Grading
• Use daily or frequent grading and average into a grade for the quarter
• Mark the correct answers rather than incorrect ones
• Weigh daily work more heavily than tests for a student who performs poorly on tests due to their disability

Source: Undivided, "Example Accommodations for IEPs and 504s" (www.undivided.io). Amharic translation prepared for Ethiopian community families.$t$,
      $t${"am": {"title": "ፈተናዎች እና ውጤት አሰጣጥ", "description": "ልጅ የሚያውቀውን እንዲያሳይ የሚያስችሉ የፈተና ሁኔታዎች፣ ቅርጸቶች እና የውጤት አሰጣጥ መንገዶች።", "body": "ይህ ዝርዝር በልጅዎ IEP (የግለሰብ የትምህርት ፕሮግራም) ወይም በ504 ዕቅድ ውስጥ ሊካተቱ የሚችሉ የማመቻቻ ምሳሌዎችን ያቀርባል። እያንዳንዱ ልጅ የተለየ ነው — ይህንን ከልጅዎ ትምህርት ቤት ቡድን ጋር ለሚደረግ ውይይት እንደ መነሻ ይጠቀሙበት።\n\nፈተና መውሰድ እና ውጤት አሰጣጥ — ፈተናዎች\n• ፈተናውን ለመውሰድ ተጨማሪ ጊዜ ይፍቀዱ\n• መመሪያዎችን በቃል ይገምግሙ\n• ተማሪው በፈተና ወቅት አስፈላጊ መድሃኒቶችን እንደ ኢንሄለር ይዞ እንዲመጣ እና እንዲወስድ ይፍቀዱ\n• አንድ ሰው መልሶችን ወደ ስካንትሮን የአረፋ ወረቀቶች እንዲያዛውር ወይም የተነገሩ ማስታወሻዎችን እና ድርሰቶችን እንዲመዘግብ ያድርጉ\n• ለተሽከርካሪ ወንበር ተደራሽ የፈተና ጣቢያዎችን ያቅርቡ\n• ከፈተናው ጋር በቀጥታ የሚዛመዱ የጥናት መመሪያዎችን እና ጥያቄዎችን ለተማሪው ያቅርቡ\n• ትኩረት የማይከፋፍል ክፍል ያቅርቡ\n• አስቀድሞ ናሙና ወይም የልምምድ ፈተናዎችን ያቅርቡ\n• የብሬይል ወይም ትልቅ-ህትመት የፈተና ደብተሮችን ያቅርቡ\n• የስክሪን-አንባቢ ቴክኖሎጂን ይፍቀዱ\n• ጸሐፊ ቁሳቁሶችን ለተማሪው እንዲያነብ እና ለተማሪው ማስታወሻ እንዲይዝ ያድርጉ\n• ፈተናዎችን ወደ ተመሳሳይ ጥያቄዎች እና ችግሮች ትናንሽ ክፍሎች ይከፋፍሉ\n• የቃል ምላሾችን፣ ንግግር-ወደ-ጽሑፍ ድጋፍ ተደራሽነትን፣ እና ለተጻፉ ምላሾች ማነብነብ ጸሐፊ ይፍቀዱ\n• ተማሪው እንደ ፈተና አማራጭ ገለልተኛ ፕሮጀክት እንዲሰራ ይፍቀዱ\n• በብዙ ቀናት ውስጥ ፈተናን ይፍቀዱ\n• የፈተና እረፍቶችን ያቅርቡ\n• የታወቀ ተቆጣጣሪ/የፈተና አስተዳዳሪ ይጠቀሙ\n• መስማት ለተሳናቸው ወይም ለከባድ የመስማት ችግር ላለባቸው ተማሪዎች በምልክት ቋንቋ አስተዳደርን ይፍቀዱ\n• ተማሪው መልሶችን ከመምረጡ በፊት ለራሱ ጮክ ብሎ እንዲያነብ ይፍቀዱ\n• በዲጂታል መንገድ ከሚሰጥ ፈተና ይልቅ የወረቀት ቅርጸት ያቅርቡ\n• ለምዘናዎች አስቀድሞ የተቀዳ የኦዲዮ አቅርቦት ያቅርቡ፣ እንደ የኦዲዮ ካሴት ቴፖች፣ ሲዲ-ሮሞች፣ የኦዲዮ ዲቪዲዎች፣ የስክሪን አንባቢ፣ ወዘተ\n• ተማሪዎች በአንድ ጊዜ በአንድ ጥያቄ ላይ እንዲያተኩሩ አላስፈላጊ ይዘትን ይሸፍኑ\n\nፈተና መውሰድ እና ውጤት አሰጣጥ — ውጤት አሰጣጥ\n• ዕለታዊ ወይም ተደጋጋሚ ውጤት አሰጣጥን ይጠቀሙ እና ለሩብ ዓመቱ አማካይ ውጤት ያድርጉ\n• ትክክለኛ መልሶችን ይምረጡ እንጂ የተሳሳቱትን ምልክት አያድርጉ\n• በአካል ጉዳት ምክንያት በፈተናዎች ደካማ አፈጻጸም ላለው ተማሪ ዕለታዊ ስራን ከፈተናዎች የበለጠ ክብደት ይስጡ\n\nምንጭ፡ Undivided፣ \"Example Accommodations for IEPs and 504s\" (www.undivided.io)። የአማርኛ ትርጉም ለኢትዮጵያ ማህበረሰብ ቤተሰቦች ተዘጋጅቷል።"}}$t$::jsonb,
      8, 'draft', 40);
    insert into public.training_lessons (module_id, title, description, body, localized, duration_minutes, status, sequence)
    values (iep, $t$Writing and handwriting$t$, $t$Tools and alternatives that reduce the load of writing by hand.$t$,
      $t$This list offers examples of accommodations that may be included in a child's IEP (Individualized Education Program) or 504 Plan. Every child is different — use this as a starting point for conversations with your child's school team.

Writing & Handwriting
• Use worksheets that require minimal writing
• Provide a computer for written work
• Use fill-in questions with space for a brief response rather than a short essay
• Provide access to word processing applications or software, a portable note taker, a tablet, or similar device
• Provide a designated note-taker or photocopy of another student's or teacher's notes (do not expect the student to arrange with another student for notes)
• Provide photocopy materials rather than requiring the student to copy from the board or textbook
• Provide outlines for videos
• Access to technology or a scribe, as needed, to record or dictate answers
• Provide adaptive writing tools, pencil grips, and a slant board or slanted surface
• Access to speech-to-text software and other technology for written assignments
• Allow the student to dictate a writing assignment for a scribe (teacher or aide) to transcribe
• Provide partially completed outlines of lectures for students to fill in the blanks
• Explore the use of alternate keyboard options and writing software
• Provide specialized, lined paper with raised lines
• Provide word models and/or tracing opportunities
• Allow spell check software
• Allow word prediction software

Source: Undivided, "Example Accommodations for IEPs and 504s" (www.undivided.io). Amharic translation prepared for Ethiopian community families.$t$,
      $t${"am": {"title": "ጽሑፍ እና በእጅ መጻፍ", "description": "በእጅ የመጻፍን ጫና የሚቀንሱ መሳሪያዎች እና አማራጮች።", "body": "ይህ ዝርዝር በልጅዎ IEP (የግለሰብ የትምህርት ፕሮግራም) ወይም በ504 ዕቅድ ውስጥ ሊካተቱ የሚችሉ የማመቻቻ ምሳሌዎችን ያቀርባል። እያንዳንዱ ልጅ የተለየ ነው — ይህንን ከልጅዎ ትምህርት ቤት ቡድን ጋር ለሚደረግ ውይይት እንደ መነሻ ይጠቀሙበት።\n\nጽሑፍ እና በእጅ መጻፍ\n• አነስተኛ ጽሑፍ የሚያስፈልጋቸውን የስራ ወረቀቶች ይጠቀሙ\n• ለጽሑፍ ስራ ኮምፒዩተር ያቅርቡ\n• ከአጭር ድርሰት ይልቅ ለአጭር ምላሽ ቦታ ያላቸውን የሙሌት ጥያቄዎችን ይጠቀሙ\n• የቃላት ማቀናበሪያ መተግበሪያዎችን ወይም ሶፍትዌርን፣ ተንቀሳቃሽ ማስታወሻ ያዥን፣ ታብሌት ወይም ተመሳሳይ መሳሪያ ተደራሽነት ያቅርቡ\n• የተመደበ ማስታወሻ ያዥ ወይም የሌላ ተማሪ ወይም የመምህር ማስታወሻ ፎቶ ኮፒ ያቅርቡ (ተማሪው ከሌላ ተማሪ ጋር ማስታወሻ እንዲያዘጋጅ አይጠብቁ)\n• ተማሪው ከሰሌዳው ወይም ከመማሪያ መጽሐፍ እንዲገለብጥ ከመጠየቅ ይልቅ የፎቶ ኮፒ ቁሳቁሶችን ያቅርቡ\n• ለቪዲዮዎች ማጠቃለያ ንድፎችን ያቅርቡ\n• አስፈላጊ ሲሆን መልሶችን ለመመዝገብ ወይም ለማነብነብ ቴክኖሎጂ ወይም ጸሐፊ ተደራሽነት\n• የተስተካከሉ የመጻፊያ መሳሪያዎችን፣ የእርሳስ መያዣዎችን እና የተዘቀዘቀ ሰሌዳ ወይም ወለል ያቅርቡ\n• ለጽሑፍ ስራዎች ንግግር-ወደ-ጽሑፍ ሶፍትዌር እና ሌላ ቴክኖሎጂ ተደራሽነት\n• ተማሪው የጽሑፍ ስራን ለጸሐፊ (መምህር ወይም ረዳት) እንዲናገር ይፍቀዱ\n• ተማሪዎች ባዶ ቦታዎችን እንዲሞሉ በከፊል የተጠናቀቁ የትምህርት ማጠቃለያ ንድፎችን ያቅርቡ\n• አማራጭ የኪቦርድ አማራጮችን እና የመጻፊያ ሶፍትዌርን አጠቃቀም ያስሱ\n• ልዩ የተነሱ መስመሮች ያሉት የተስመረ ወረቀት ያቅርቡ\n• የቃል ናሙናዎችን እና/ወይም የመከታተያ እድሎችን ያቅርቡ\n• የፊደል አጻጻፍ ማረም ሶፍትዌርን ይፍቀዱ\n• የቃል ትንበያ ሶፍትዌርን ይፍቀዱ\n\nምንጭ፡ Undivided፣ \"Example Accommodations for IEPs and 504s\" (www.undivided.io)። የአማርኛ ትርጉም ለኢትዮጵያ ማህበረሰብ ቤተሰቦች ተዘጋጅቷል።"}}$t$::jsonb,
      6, 'draft', 50);
    insert into public.training_lessons (module_id, title, description, body, localized, duration_minutes, status, sequence)
    values (iep, $t$Behavioral accommodations$t$, $t$Positive, consistent supports for behavior and self-regulation at school.$t$,
      $t$This list offers examples of accommodations that may be included in a child's IEP (Individualized Education Program) or 504 Plan. Every child is different — use this as a starting point for conversations with your child's school team.

Behavioral Accommodations
• Pair the student with those who are modeling good behavior for classwork, projects, and mentoring
• Develop an individualized behavior intervention plan that is positive and consistent with the student's ability and skills
• Reward positive behaviors; increase the frequency and immediacy of reinforcement
• Ignore behaviors that are not seriously disruptive
• Create a "back pocket pass" the student can use to leave the classroom without asking for permission
• Allow sensory and/or fidget objects to help the student self-regulate
• Establish a plan to manage side effects of medication (such as providing a water bottle for thirst or allowing extra bathroom breaks)
• Develop a system or code word to let the student know when behavior is not appropriate
• Arrange a "check-in" time to organize the day
• Modify school rules that might discriminate against the student
• Minimize the use of punishment; amend consequences for rule violations (for example, reward a forgetful student for remembering to bring pencils to class, rather than punishing the failure to remember)
• Arrange for the student to leave the classroom/learning area voluntarily and go to a designated "safe place" when under high stress

Source: Undivided, "Example Accommodations for IEPs and 504s" (www.undivided.io). Amharic translation prepared for Ethiopian community families.$t$,
      $t${"am": {"title": "የባህሪ ማመቻቻዎች", "description": "በትምህርት ቤት ለባህሪ እና ራስን ለመቆጣጠር አዎንታዊ እና ወጥ ድጋፎች።", "body": "ይህ ዝርዝር በልጅዎ IEP (የግለሰብ የትምህርት ፕሮግራም) ወይም በ504 ዕቅድ ውስጥ ሊካተቱ የሚችሉ የማመቻቻ ምሳሌዎችን ያቀርባል። እያንዳንዱ ልጅ የተለየ ነው — ይህንን ከልጅዎ ትምህርት ቤት ቡድን ጋር ለሚደረግ ውይይት እንደ መነሻ ይጠቀሙበት።\n\nየባህሪ ማመቻቻዎች\n• ተማሪውን ጥሩ ባህሪ ከሚያሳዩ ተማሪዎች ጋር ለክፍል ስራ፣ ፕሮጀክቶች እና አማካሪነት ያጣምሩ\n• ከተማሪው ችሎታ እና ክህሎት ጋር የሚስማማ አዎንታዊ የግለሰብ ባህሪ ጣልቃ ገብነት እቅድ ያዘጋጁ\n• አዎንታዊ ባህሪያትን ይሸልሙ፤ የማበረታቻ ድግግሞሽን እና ፈጣንነትን ይጨምሩ\n• በጣም አስቸጋሪ ያልሆኑ ባህሪያትን ችላ ይበሉ\n• ተማሪው ያለ ፍቃድ ክፍልን ለቅቆ መውጣት የሚችልበት \"የኋላ ኪስ ፍቃድ\" ይፍጠሩ\n• ተማሪው ራሱን እንዲቆጣጠር ለመርዳት የስሜት ህዋሳት እና/ወይም ፊጅት ዕቃዎችን ይፍቀዱ\n• የመድሃኒት የጎንዮሽ ጉዳቶችን ለማስተዳደር እቅድ ያውጡ (እንደ ለጥም የውሃ ጠርሙስ መስጠት ወይም ተጨማሪ የመጸዳጃ ቤት እረፍት መፍቀድ)\n• ባህሪው ተገቢ ያልሆነ መሆኑን ተማሪው እንዲያውቅ ስርዓት ወይም የምስጢር ቃል ያዘጋጁ\n• ቀኑን ለማደራጀት \"የመግቢያ ማረጋገጫ\" ጊዜ ያዘጋጁ\n• ተማሪውን ሊያገለሉ የሚችሉ የትምህርት ቤት ደንቦችን ያሻሽሉ\n• የቅጣት አጠቃቀምን ይቀንሱ፤ ለደንብ ጥሰቶች ውጤቶችን ያሻሽሉ (ለምሳሌ፣ የመርሳት ችግር ያለበትን ተማሪ እርሳስ ወደ ክፍል በማምጣቱ ይሸልሙ እንጂ ባለማስታወሱ አይቅጡት)\n• ተማሪው ከፍተኛ ጭንቀት ሲሰማው በፈቃደኝነት ክፍልን/የመማሪያ ቦታን ለቅቆ ወደ ተመደበ \"ደህንነቱ የተጠበቀ ቦታ\" እንዲሄድ ያዘጋጁ\n\nምንጭ፡ Undivided፣ \"Example Accommodations for IEPs and 504s\" (www.undivided.io)። የአማርኛ ትርጉም ለኢትዮጵያ ማህበረሰብ ቤተሰቦች ተዘጋጅቷል።"}}$t$::jsonb,
      5, 'draft', 60);
    insert into public.training_lessons (module_id, title, description, body, localized, duration_minutes, status, sequence)
    values (iep, $t$Health accommodations$t$, $t$Supports for eating, tube feeding, toileting and other health needs during the school day.$t$,
      $t$This list offers examples of accommodations that may be included in a child's IEP (Individualized Education Program) or 504 Plan. Every child is different — use this as a starting point for conversations with your child's school team.

Health Accommodations — Eating Orally
• Provide 1:1 supervision during lunch and snack times for those with food allergies or who are at risk for aspiration or choking
• Provide the opportunity to snack during instruction or take short breaks from instruction for snacking (for students who may not be able to consume sufficient calories during a designated lunch period)
• Provide verbal or visual cues to chew, swallow, and/or monitor the amount of food to prevent choking
• Provide behavioral motivators for students who need positive encouragement to eat
• Provide a "nut-free" table or classroom for those with severe allergies
• Provide specific chairs, utensils, cups, straws, or positioners
• Allow extra time during meals for students with reduced endurance for self-feeding
• Allow an adult-supported peer group to provide modeling and socialization during meals and snacks

Health Accommodations — Eating Using a G-Tube
• Administer tube feeds where the student is most comfortable (such as the nurse's office, lunch room, or classroom)
• Allow use of specific chairs or positioners during and following tube feeds for students who need to be in an upright position to manage reflux or other medical issues
• Provide designated support staff (nurse or trained assistant) to administer tube feeds, as needed
• Provide stoma site management by school nurse, as needed
• Monitor for safety during tube feedings
• Provide an emergency plan with school nurse if the tube becomes dislodged at school

Health Accommodations — Toileting
• Allow the student to use the bathroom at the nurses' station
• Allow extra time to get to and from the bathroom, and more time as needed while there
• Provide an adaptive toilet seat as needed, and access to a handicap-accessible stall
• Provide nurse support for catheter care
• If a student wears diapers, provide access to a private, safe, and sanitary diaper-changing station out of sight of peers

Health Accommodations — Additional Health Considerations
• Allow a hat to be worn during recess for students with sun sensitivity due to a health condition
• Allow the student to leave class to use the nurses' station as needed (for example, to take medicine)
• Provide access to temperature-controlled spaces during outside activities in times of excessive heat or cold for students with medical sensitivities to extreme weather
• Provide a 1:1 aide during transportation for medical needs

Source: Undivided, "Example Accommodations for IEPs and 504s" (www.undivided.io). Amharic translation prepared for Ethiopian community families.$t$,
      $t${"am": {"title": "የጤና ማመቻቻዎች", "description": "በትምህርት ቀን ለመመገብ፣ ለቱቦ አመጋገብ፣ ለመጸዳጃ ቤት እና ለሌሎች የጤና ፍላጎቶች ድጋፎች።", "body": "ይህ ዝርዝር በልጅዎ IEP (የግለሰብ የትምህርት ፕሮግራም) ወይም በ504 ዕቅድ ውስጥ ሊካተቱ የሚችሉ የማመቻቻ ምሳሌዎችን ያቀርባል። እያንዳንዱ ልጅ የተለየ ነው — ይህንን ከልጅዎ ትምህርት ቤት ቡድን ጋር ለሚደረግ ውይይት እንደ መነሻ ይጠቀሙበት።\n\nየጤና ማመቻቻዎች — በአፍ መመገብ\n• ለምግብ አለርጂ ላለባቸው ወይም ለመተንፈሻ አካል ችግር ወይም ለመታነቅ ተጋላጭ ለሆኑት በምሳ እና በመክሰስ ጊዜ የ1:1 ክትትል ያቅርቡ\n• በተወሰነው የምሳ ሰዓት በቂ ካሎሪ መመገብ ለማይችሉ ተማሪዎች በማስተማር ወቅት መክሰስ የመመገብ ወይም ለመክሰስ አጭር እረፍት የመውሰድ እድል ያቅርቡ\n• ለመታነቅ መከላከል ለማኘክ፣ ለመዋጥ እና/ወይም የምግብ መጠንን ለመከታተል የቃል ወይም የእይታ ምልክቶችን ያቅርቡ\n• ለመመገብ አዎንታዊ ማበረታቻ ለሚያስፈልጋቸው ተማሪዎች የባህሪ ማነሳሻዎችን ያቅርቡ\n• ከባድ አለርጂ ላለባቸው \"ለውዝ-ነጻ\" ጠረጴዛ ወይም ክፍል ያቅርቡ\n• የተወሰኑ ወንበሮችን፣ ማንኪያ ሹካዎችን፣ ኩባያዎችን፣ ገለባዎችን ወይም ማስተካከያዎችን ያቅርቡ\n• ራስን በራስ ለመመገብ ትዕግስት ላነሳቸው ተማሪዎች በምግብ ወቅት ተጨማሪ ጊዜ ይፍቀዱ\n• በምግብ እና በመክሰስ ወቅት አርአያነትን እና ማህበራዊነትን ለማቅረብ በአዋቂ የሚደገፍ የእኩዮች ቡድን ይፍቀዱ\n\nየጤና ማመቻቻዎች — በጂ-ቱቦ መመገብ\n• ተማሪው በጣም ምቾት በሚሰማው ቦታ (እንደ የነርስ ቢሮ፣ የምሳ ክፍል ወይም ክፍል) የቱቦ ምግብን ያቅርቡ\n• ሪፍላክስ ወይም ሌሎች የህክምና ጉዳዮችን ለማስተዳደር ቀጥ ብለው መቀመጥ ለሚያስፈልጋቸው ተማሪዎች በቱቦ አመጋገብ ወቅት እና በኋላ የተወሰኑ ወንበሮች ወይም ማስተካከያዎች አጠቃቀምን ይፍቀዱ\n• አስፈላጊ ሲሆን የቱቦ ምግብን ለማቅረብ የተመደበ የድጋፍ ሰራተኛ (ነርስ ወይም የሰለጠነ ረዳት) ያቅርቡ\n• አስፈላጊ ሲሆን በትምህርት ቤት ነርስ የስቶማ ቦታ አያያዝን ያቅርቡ\n• በቱቦ አመጋገብ ወቅት ደህንነትን ይከታተሉ\n• ቱቦው በትምህርት ቤት ውስጥ ከቦታው ቢወጣ ከትምህርት ቤት ነርስ ጋር የአደጋ ጊዜ እቅድ ያቅርቡ\n\nየጤና ማመቻቻዎች — የመጸዳጃ ቤት አጠቃቀም\n• ተማሪው በነርስ ጣቢያ የመጸዳጃ ቤት እንዲጠቀም ይፍቀዱ\n• ወደ መጸዳጃ ቤት ለመሄድ እና ለመመለስ ተጨማሪ ጊዜ ይፍቀዱ፣ እና እዚያ ውስጥ እንዳስፈላጊነቱ ተጨማሪ ጊዜ\n• እንደ አስፈላጊነቱ የተስተካከለ የመጸዳጃ ወንበር እና ለአካል ጉዳተኞች ተደራሽ ወደሆነ ክፍል ተደራሽነት ያቅርቡ\n• ለካቴተር እንክብካቤ የነርስ ድጋፍ ያቅርቡ\n• ተማሪ ዳይፐር የሚጠቀም ከሆነ ከእኩዮች እይታ ውጭ የግል፣ ደህንነቱ የተጠበቀ እና ንፁህ የዳይፐር መቀየሪያ ቦታ ተደራሽነት ያቅርቡ\n\nየጤና ማመቻቻዎች — ተጨማሪ የጤና ጉዳዮች\n• በጤና ሁኔታ ምክንያት ለፀሐይ ብርሃን ስሜታዊ ለሆኑ ተማሪዎች በእረፍት ጊዜ ኮፍያ እንዲለብሱ ይፍቀዱ\n• አስፈላጊ ሲሆን (ለምሳሌ መድሃኒት ለመውሰድ) ተማሪው ክፍልን ለቅቆ የነርስ ጣቢያን እንዲጠቀም ይፍቀዱ\n• ለከባድ የአየር ሁኔታ ስሜታዊ ለሆኑ ተማሪዎች ከፍተኛ ሙቀት ወይም ብርድ በሚኖርበት ጊዜ በውጭ እንቅስቃሴዎች ወቅት የሙቀት-ቁጥጥር ወዳላቸው ቦታዎች ተደራሽነት ያቅርቡ\n• ለህክምና ፍላጎቶች በትራንስፖርት ወቅት የ1:1 ረዳት ያቅርቡ\n\nምንጭ፡ Undivided፣ \"Example Accommodations for IEPs and 504s\" (www.undivided.io)። የአማርኛ ትርጉም ለኢትዮጵያ ማህበረሰብ ቤተሰቦች ተዘጋጅቷል።"}}$t$::jsonb,
      8, 'draft', 70);
    insert into public.training_lessons (module_id, title, description, body, localized, duration_minutes, status, sequence)
    values (iep, $t$Low-incidence and additional accommodations$t$, $t$Supports for visual, auditory and mobility needs, plus organization and other accommodations.$t$,
      $t$This list offers examples of accommodations that may be included in a child's IEP (Individualized Education Program) or 504 Plan. Every child is different — use this as a starting point for conversations with your child's school team.

Low-Incidence Accommodations — Visual Processing
• Provide all materials in enlarged font
• Provide slant boards or slanted surface
• Use larger manipulatives
• Provide verbal descriptions of visual aids
• Reduce clutter on the page
• Use high-contrast materials
• Provide preferential seating
• Provide a printed copy of what's being presented on the board
• Use raised-line drawings and tactile models of graphic materials
• Provide Audiotaped, Brailled, or electronically formatted notes, handouts, and texts
• Provide Braille lab signs and equipment labels, as well as auditory lab warning signals
• Provide adaptive lab equipment (talking thermometers and calculators, light probes, and tactile timers)
• Provide access to computer with optical character reader, voice output, Braille screen display, and printer output
• Provide magnification
• Use color-contrast materials

Low-Incidence Accommodations — Auditory Processing
• Provide preferential seating
• Reduce background noise
• Provide additional written or visual material
• Provide an FM system to amplify the teacher
• Simplify directions and verbal instruction
• Use a peer-pairing system to check notes and/or assignments

Low-Incidence Accommodations — Mobility/Orthopedic
• Provide accessible play equipment or alternatives (e.g., a lighter/softer ball for sports activities; an adaptive tricycle if the playground and field are otherwise inaccessible)
• If the school has an elevator, make sure the teacher and any classroom or 1:1 aides have a key so the student doesn't have to wait to access it
• Provide appropriate seating in the classroom, at school-wide events, and during toileting (e.g., an adaptive toileting seat)
• Provide physical modifications to assignments for increased fine motor control (e.g., raised outlines to help a student stay within the lines on writing and coloring projects)
• Use appropriate workspace height and spacing in the classroom to allow for physical navigation where applicable, especially but not exclusively if the student is using a wheelchair or walker
• Allow extra time to get to the bathroom, from class to class, to and from lunch and recess, and more, especially on large campuses
• Establish clearly defined times when a student will use a piece of mobility equipment during the day (e.g., time in a stander or walker to ensure physical activity, particularly for students who use a wheelchair)

Additional Accommodations
• Check progress and provide feedback often in the first few minutes of each assignment
• Explore the use of memory organization aides (tablets, cell phone calendars, task lists, and visual schedules)
• Introduce an overview of long-term assignments so the student knows what is expected and when it is due
• Establish a regular form of communication between home and school
• Provide structured assignments with lists for the student to cross off when finished
• Use color-coded materials for each class
• Break long-term assignments into small, sequential steps with daily monitoring and frequent grading
• Reward the student for recording assignments and due dates in a notebook
• Have the student practice presenting in a small group before presenting to the class
• Structure work so that the easiest parts come first
• Give the student worksheets one at a time
• Allow the use of sensory tools
• Draw arrows on worksheets or the board to show how ideas are related, or use other graphic organizers such as flow charts
• Provide locker accommodations (such as a key versus a combination lock)

Source: Undivided, "Example Accommodations for IEPs and 504s" (www.undivided.io). Amharic translation prepared for Ethiopian community families.$t$,
      $t${"am": {"title": "ብርቅዬ እና ተጨማሪ ማመቻቻዎች", "description": "ለእይታ፣ ለመስማት እና ለእንቅስቃሴ ፍላጎቶች ድጋፎች፣ እንዲሁም የአደረጃጀት እና ሌሎች ማመቻቻዎች።", "body": "ይህ ዝርዝር በልጅዎ IEP (የግለሰብ የትምህርት ፕሮግራም) ወይም በ504 ዕቅድ ውስጥ ሊካተቱ የሚችሉ የማመቻቻ ምሳሌዎችን ያቀርባል። እያንዳንዱ ልጅ የተለየ ነው — ይህንን ከልጅዎ ትምህርት ቤት ቡድን ጋር ለሚደረግ ውይይት እንደ መነሻ ይጠቀሙበት።\n\nብርቅዬ ማመቻቻዎች — የእይታ ሂደት\n• ሁሉንም ቁሳቁሶች በተስፋፋ ፊደል ያቅርቡ\n• የተዘቀዘቀ ሰሌዳ ወይም ወለል ያቅርቡ\n• ትልልቅ የመማሪያ/የመዳሰሻ እቃዎችን ይጠቀሙ\n• ለእይታ እርዳታዎች የቃል መግለጫዎችን ያቅርቡ\n• በገጹ ላይ ያለውን ብጥብጥ ይቀንሱ\n• ከፍተኛ ንፅፅር ያላቸውን ቁሳቁሶች ይጠቀሙ\n• ተመራጭ መቀመጫ ያቅርቡ\n• በሰሌዳው ላይ የሚቀርበውን የታተመ ቅጂ ያቅርቡ\n• የተነሱ-መስመር ስዕሎችን እና የግራፊክ ቁሳቁሶች የመዳሰሻ ሞዴሎችን ይጠቀሙ\n• በኦዲዮ የተቀዱ፣ በብሬይል የተጻፉ ወይም በኤሌክትሮኒክ ቅርጸት የተዘጋጁ ማስታወሻዎችን፣ ማከፋፈያ ወረቀቶችን እና ጽሑፎችን ያቅርቡ\n• የብሬይል ላብራቶሪ ምልክቶችን እና የመሳሪያ መለያዎችን እንዲሁም የመስማት ላብራቶሪ ማስጠንቀቂያ ምልክቶችን ያቅርቡ\n• የተስተካከሉ የላብራቶሪ መሳሪያዎችን ያቅርቡ (የሚናገሩ ቴርሞሜትሮች እና ካልኩሌተሮች፣ የብርሃን መመርመሪያዎች እና የመዳሰሻ ሰዓት ቆጣሪዎች)\n• የኦፕቲካል ካራክተር አንባቢ፣ የድምጽ ውጤት፣ የብሬይል ስክሪን ማሳያ እና የማተሚያ ውጤት ላለው ኮምፒዩተር ተደራሽነት ያቅርቡ\n• ማጉላትን ያቅርቡ\n• የቀለም-ንፅፅር ቁሳቁሶችን ይጠቀሙ\n\nብርቅዬ ማመቻቻዎች — የመስማት ሂደት\n• ተመራጭ መቀመጫ ያቅርቡ\n• የበስተጀርባ ድምጽን ይቀንሱ\n• ተጨማሪ የተጻፈ ወይም የእይታ ቁሳቁስ ያቅርቡ\n• የመምህሩን ድምጽ ለማጉላት የFM ስርዓት ያቅርቡ\n• መመሪያዎችን እና የቃል ትምህርትን ያቅልሉ\n• ማስታወሻዎችን እና/ወይም ስራዎችን ለማረጋገጥ የእኩዮች ማጣመሪያ ስርዓት ይጠቀሙ\n\nብርቅዬ ማመቻቻዎች — የእንቅስቃሴ/የአጥንት ችግር\n• ተደራሽ የመጫወቻ መሳሪያዎችን ወይም አማራጮችን ያቅርቡ (ለምሳሌ፣ ለስፖርት እንቅስቃሴዎች ቀላል/ለስላሳ ኳስ፤ የመጫወቻ ስፍራው እና ሜዳው ተደራሽ ካልሆኑ የተስተካከለ ባለሶስት ጎማ ብስክሌት)\n• ትምህርት ቤቱ ሊፍት ካለው፣ ተማሪው ለመጠቀም መጠበቅ እንዳይኖርበት መምህሩ እና ማንኛውም የክፍል ወይም የ1:1 ረዳቶች ቁልፍ እንዳላቸው ያረጋግጡ\n• በክፍል ውስጥ፣ በትምህርት ቤት አቀፍ ዝግጅቶች እና በመጸዳጃ ቤት ወቅት ተገቢ መቀመጫ ያቅርቡ (ለምሳሌ፣ የተስተካከለ የመጸዳጃ ወንበር)\n• ለተሻለ ጥቃቅን የጡንቻ ቁጥጥር ለስራዎች አካላዊ ማሻሻያዎችን ያቅርቡ (ለምሳሌ፣ ተማሪው በጽሑፍ እና በቀለም ስራዎች ውስጥ በመስመሮች ውስጥ እንዲቆይ ለመርዳት የተነሱ ንድፎች)\n• ተማሪው ተሽከርካሪ ወንበር ወይም ዎከር የሚጠቀም ከሆነ በተለይ ግን ብቻ ሳይሆን፣ አካላዊ እንቅስቃሴን ለማስቻል በክፍል ውስጥ ተገቢውን የስራ ቦታ ቁመት እና ክፍተት ይጠቀሙ\n• ወደ መጸዳጃ ቤት፣ ከክፍል ወደ ክፍል፣ ወደ ምሳ እና እረፍት እና ተጨማሪ ለመሄድ ተጨማሪ ጊዜ ይፍቀዱ፣ በተለይ በትልልቅ ግቢዎች ውስጥ\n• ተማሪው በቀኑ ውስጥ የተንቀሳቃሽነት መሳሪያን የሚጠቀምበትን ግልጽ ጊዜያት ያዘጋጁ (ለምሳሌ፣ ተሽከርካሪ ወንበር ለሚጠቀሙ ተማሪዎች በተለይ አካላዊ እንቅስቃሴን ለማረጋገጥ በስታንደር ወይም ዎከር ውስጥ ጊዜ)\n\nተጨማሪ ማመቻቻዎች\n• በእያንዳንዱ ስራ የመጀመሪያዎቹ ጥቂት ደቂቃዎች ውስጥ እድገትን በተደጋጋሚ ያረጋግጡ እና ግብረመልስ ይስጡ\n• የማስታወሻ አደረጃጀት እርዳታዎችን አጠቃቀም ያስሱ (ታብሌቶች፣ የስልክ የቀን መቁጠሪያዎች፣ የስራ ዝርዝሮች እና የእይታ መርሃ ግብሮች)\n• ተማሪው የሚጠበቀውን እና መቼ እንደሚያስረክብ እንዲያውቅ የረጅም ጊዜ ስራዎችን አጠቃላይ እይታ ያስተዋውቁ\n• በቤት እና በትምህርት ቤት መካከል መደበኛ የመግባቢያ መንገድ ያዘጋጁ\n• ተማሪው ሲጨርስ ምልክት የሚያደርግባቸው ዝርዝሮች ያሏቸው የተደራጁ ስራዎችን ያቅርቡ\n• ለእያንዳንዱ ክፍል በቀለም የተለዩ ቁሳቁሶችን ይጠቀሙ\n• የረጅም ጊዜ ስራዎችን ከዕለታዊ ክትትል እና ተደጋጋሚ ውጤት አሰጣጥ ጋር ወደ ትናንሽ ተከታታይ ደረጃዎች ይክፈሉ\n• ተማሪውን ስራዎችን እና የማስረከቢያ ቀናትን በማስታወሻ ደብተር ውስጥ በመመዝገቡ ይሸልሙ\n• ተማሪው ለክፍል ከማቅረቡ በፊት በትንሽ ቡድን ውስጥ ማቅረብን እንዲለማመድ ያድርጉ\n• በጣም ቀላል ክፍሎች መጀመሪያ እንዲመጡ ስራን ያዋቅሩ\n• ለተማሪው የስራ ወረቀቶችን በአንድ ጊዜ አንድ ይስጡ\n• የስሜት ህዋሳት መሳሪያዎችን አጠቃቀም ይፍቀዱ\n• ሃሳቦች እንዴት እንደሚዛመዱ ለማሳየት በስራ ወረቀቶች ወይም በሰሌዳው ላይ ቀስቶችን ይሳሉ፣ ወይም እንደ የፍሰት ገበታዎች ያሉ ሌሎች የግራፊክ አደራጆችን ይጠቀሙ\n• የሎከር ማመቻቻዎችን ያቅርቡ (እንደ ቁልፍ ከጥምር መቆለፊያ ይልቅ)\n\nምንጭ፡ Undivided፣ \"Example Accommodations for IEPs and 504s\" (www.undivided.io)። የአማርኛ ትርጉም ለኢትዮጵያ ማህበረሰብ ቤተሰቦች ተዘጋጅቷል።"}}$t$::jsonb,
      14, 'draft', 80);
  end if;
end $$;
