import type { Owner, Source, ValueType } from "../lib/db/enums";

export type StageSpec = {
  name: string;
  staleAfterDays: number | null;
  isWon?: boolean;
  isLost?: boolean;
  isSequence?: boolean;
};

export const OUTBOUND_STAGES: StageSpec[] = [
  { name: "New Lead", staleAfterDays: 3 },
  { name: "Researched", staleAfterDays: 4 },
  // Sending the first message is day one of the cadence, so contacting and
  // following up are one stage with a sub-board behind it.
  {
    name: "In Sequence",
       staleAfterDays: 30,
    isSequence: true,
  },
  { name: "Replied", staleAfterDays: 3 },
  { name: "Call Booked", staleAfterDays: 7 },
  // The call was taken and we are working to close it.
  { name: "Closing", staleAfterDays: 5 },
  { name: "Won", staleAfterDays: null, isWon: true },
  { name: "Lost", staleAfterDays: null, isLost: true },
];

export const DELIVERY_STAGES: StageSpec[] = [
  // Onboarding is exactly where a signed client goes quiet, so it has the
  // tightest clock on either board.
  { name: "Onboarding", staleAfterDays: 3 },
  { name: "Building", staleAfterDays: 7 },
  { name: "Live", staleAfterDays: 30 },
  { name: "Churned", staleAfterDays: null, isLost: true },
];

/** Index into the outbound funnel, ignoring the Lost stage. */
export const FUNNEL = {
  newLead: 0,
  researched: 1,
  inSequence: 2,
  replied: 3,
  callBooked: 4,
  closing: 5,
  won: 6,
} as const;

export type LeadSpec = {
  firstName: string;
  lastName: string;
  company: string;
  handle: string;
  email: string;
  website: string;
  niche: string;
  offerType: string;
  /** Their monthly revenue in whole dollars. */
  monthlyRevenue: number;
  source: Source;
  owner: Owner;
  /** What they would pay us, in whole dollars. */
  value: number;
  valueType: ValueType;
  /** Furthest funnel stage this lead ever reached. */
  reached: number;
  /** Days the deal has been sitting in its current stage. */
  ageInStage: number;
  lost?: { reason: string };
  /** Died inside the cadence: lands in No Answer rather than plain Lost. */
  lostInSequence?: boolean;
  tags: string[];
  /** Stage indexes the lead jumped over, e.g. inbound skipping research. */
  skipped?: number[];
  research: string;
  angle: string;
};

/**
 * Thirty leads that read like a real scraped list: coaching and info-product
 * operators with plausible revenue, plausible offers, and a plausible reason
 * we would be talking to them.
 */
export const LEADS: LeadSpec[] = [
  {
    firstName: "Marcus", lastName: "Holloway",
    company: "Ironclad Strength", handle: "@coachmarcusholloway",
    email: "marcus@ironcladstrength.co", website: "ironcladstrength.co",
    niche: "Strength coaching for lifters over 35", offerType: "1:1 online coaching",
    monthlyRevenue: 45_000, source: "ig_dm", owner: "riley",
    value: 4_000, valueType: "monthly_recurring",
    reached: FUNNEL.won, ageInStage: 12,
    tags: ["fitness", "high-intent"],
    research: "Sells a $400/mo 1:1 slot, about 90 active clients, all sold in DMs by hand. No CRM, no sequences, tracks everything in a Notes app.",
    angle: "He is the bottleneck on his own sales. Every lead waits on him to reply personally.",
  },
  {
    firstName: "Priya", lastName: "Raghunathan",
    company: "The Clarity Practice", handle: "@priya.clarity",
    email: "priya@theclaritypractice.com", website: "theclaritypractice.com",
    niche: "Mindset coaching for women in tech leadership", offerType: "12-week group program",
    monthlyRevenue: 28_000, source: "cold_email", owner: "kavi",
    value: 3_500, valueType: "monthly_recurring",
    reached: FUNNEL.inSequence, ageInStage: 19,
    lostInSequence: true,
    lost: { reason: "Four emails over three weeks. Opened twice, never replied. Parked until the next cohort launch." },
    tags: ["coaching", "warm"],
    research: "Runs two cohorts a year at $2,400 a seat. Fills them off a 9k newsletter and nothing else. Waitlist goes cold between launches.",
    angle: "Dead air between cohorts. Nothing nurtures the waitlist for four months at a stretch.",
  },
  {
    firstName: "Dane", lastName: "Whitfield",
    company: "Apex Trading Academy", handle: "@apextrading.dane",
    email: "dane@apextradingacademy.com", website: "apextradingacademy.com",
    niche: "Futures trading education", offerType: "8-week cohort course",
    monthlyRevenue: 180_000, source: "ig_dm", owner: "riley",
    value: 7_500, valueType: "monthly_recurring",
    reached: FUNNEL.closing, ageInStage: 6,
    tags: ["info-product", "high-ticket", "high-intent"],
    research: "$180k/mo off paid traffic to a webinar. Two setters, no SDR process, show rate under 40%.",
    angle: "Show rate is the whole problem. They are paying for booked calls that never happen.",
  },
  {
    firstName: "Simone", lastName: "Okafor",
    company: "Rooted Nutrition Co", handle: "@simone.rooted",
    email: "hello@rootednutrition.co", website: "rootednutrition.co",
    niche: "Nutrition coaching for endurance athletes", offerType: "Membership",
    monthlyRevenue: 22_000, source: "cold_email", owner: "kavi",
    value: 2_500, valueType: "monthly_recurring",
    reached: FUNNEL.inSequence, ageInStage: 9,
    tags: ["nutrition", "membership"],
    research: "$49/mo membership, roughly 450 members, churn around 9% monthly. Growth is all organic Reels.",
    angle: "Churn eats every new member. Retention is worth more to her than acquisition right now.",
  },
  {
    firstName: "Tobias", lastName: "Lindqvist",
    company: "Freight Broker Blueprint", handle: "@tobiasfreight",
    email: "tobias@freightbrokerblueprint.com", website: "freightbrokerblueprint.com",
    niche: "Freight brokerage training", offerType: "Evergreen course",
    monthlyRevenue: 95_000, source: "ig_dm", owner: "riley",
    value: 6_000, valueType: "monthly_recurring",
    reached: FUNNEL.won, ageInStage: 24,
    tags: ["info-product", "high-ticket"],
    research: "$1,997 evergreen course doing about 48 sales a month, entirely off YouTube. Zero paid, zero outbound.",
    angle: "Enormous back catalogue of warm viewers and no mechanism to reach them twice.",
  },
  {
    firstName: "Renata", lastName: "Vasquez",
    company: "Bold Voice Studio", handle: "@renata.boldvoice",
    email: "renata@boldvoicestudio.com", website: "boldvoicestudio.com",
    niche: "Public speaking coaching for founders", offerType: "1:1 intensive",
    monthlyRevenue: 18_000, source: "referral", owner: "kavi",
    value: 3_000, valueType: "monthly_recurring",
    reached: FUNNEL.inSequence, ageInStage: 1,
    tags: ["coaching", "referral"],
    research: "$3k intensives, about six a month, all word of mouth from two accelerators.",
    angle: "Entirely dependent on two referral sources. One relationship ending halves her business.",
  },
  {
    firstName: "Colin", lastName: "Mbeki",
    company: "Agency Ascend", handle: "@colin.agencyascend",
    email: "colin@agencyascend.io", website: "agencyascend.io",
    niche: "Growth coaching for marketing agency owners", offerType: "Mastermind",
    monthlyRevenue: 120_000, source: "inbound", owner: "riley",
    value: 9_000, valueType: "monthly_recurring",
    reached: FUNNEL.closing, ageInStage: 3,
    skipped: [FUNNEL.researched],
    tags: ["mastermind", "high-ticket", "high-intent"],
    research: "$2,500/mo mastermind, 48 members. Came in through the site after reading the teardown post.",
    angle: "Knows exactly what he wants. Asked about pricing on the first call.",
  },
  {
    firstName: "Harper", lastName: "Quinlan",
    company: "The Lean Method", handle: "@harperquinlan",
    email: "harper@theleanmethod.fit", website: "theleanmethod.fit",
    niche: "Fat loss coaching for busy parents", offerType: "Group coaching",
    monthlyRevenue: 60_000, source: "ig_dm", owner: "kavi",
    value: 4_500, valueType: "monthly_recurring",
    reached: FUNNEL.callBooked, ageInStage: 8,
    tags: ["fitness", "high-intent"],
    research: "$297/mo group, roughly 200 clients. Two coaches under her. Sells with a 15-minute call booked off a quiz.",
    angle: "Quiz converts well, the call itself does not. No follow-up on no-shows at all.",
  },
  {
    firstName: "Idris", lastName: "Ahmed",
    company: "Halal Wealth Lab", handle: "@idris.wealthlab",
    email: "idris@halalwealthlab.com", website: "halalwealthlab.com",
    niche: "Shariah-compliant investing education", offerType: "Membership",
    monthlyRevenue: 70_000, source: "cold_email", owner: "riley",
    value: 5_000, valueType: "monthly_recurring",
    reached: FUNNEL.inSequence, ageInStage: 23,
    tags: ["info-product", "membership"],
    research: "$79/mo membership, about 880 members. Underserved niche, very little competition, all growth from one viral thread a year ago.",
    angle: "Growth has flatlined since the thread. No repeatable acquisition at all.",
  },
  {
    firstName: "Noelle", lastName: "Brantley",
    company: "Second Act Coaching", handle: "@noellebrantley",
    email: "noelle@secondactcoaching.com", website: "secondactcoaching.com",
    niche: "Career pivot coaching for people over 45", offerType: "1:1 coaching",
    monthlyRevenue: 15_000, source: "list_import", owner: "kavi",
    value: 2_000, valueType: "monthly_recurring",
    reached: FUNNEL.newLead, ageInStage: 2,
    tags: ["coaching"],
    research: "Pulled from the LinkedIn coaches scrape. Website is a single page, no offer stated, no pricing.",
    angle: "Needs qualifying before anyone spends time on her.",
  },
  {
    firstName: "Grant", lastName: "Pettersen",
    company: "Summit Sales Lab", handle: "@grantpettersen",
    email: "grant@summitsaleslab.com", website: "summitsaleslab.com",
    niche: "Sales training for SaaS teams", offerType: "Certification program",
    monthlyRevenue: 140_000, source: "cold_email", owner: "riley",
    value: 8_000, valueType: "monthly_recurring",
    reached: FUNNEL.closing, ageInStage: 3,
    tags: ["b2b", "high-ticket", "high-intent"],
    research: "$4,500 certification sold to teams. Deal sizes are large, volume is low, pipeline is entirely referral.",
    angle: "Wants predictable top of funnel. Said outbound is the only lever he has not pulled.",
  },
  {
    firstName: "Ayesha", lastName: "Karim",
    company: "Postpartum Strong", handle: "@ayesha.postpartum",
    email: "ayesha@postpartumstrong.com", website: "postpartumstrong.com",
    niche: "Pre and postnatal fitness", offerType: "App plus coaching",
    monthlyRevenue: 35_000, source: "ig_dm", owner: "kavi",
    value: 3_000, valueType: "monthly_recurring",
    reached: FUNNEL.researched, ageInStage: 6,
    tags: ["fitness", "app"],
    research: "$39/mo app with an upsell to $250/mo coaching. 700 app subscribers, only 14 on coaching.",
    angle: "The upsell path barely exists. Almost nobody is ever asked.",
  },
  {
    firstName: "Devon", lastName: "Ricci",
    company: "Closer School", handle: "@devonricci",
    email: "devon@closerschool.io", website: "closerschool.io",
    niche: "High-ticket closing training", offerType: "Cohort course",
    monthlyRevenue: 210_000, source: "ig_dm", owner: "riley",
    value: 12_000, valueType: "one_time",
    reached: FUNNEL.replied, ageInStage: 21,
    lost: { reason: "Went quiet after two positive replies. Building an in-house setter team instead." },
    tags: ["info-product", "high-ticket"],
    research: "$5k cohort, four a year, sells off a 40-minute VSL. Big paid spend on Meta.",
    angle: "Replied twice, engaged on the diagnosis, then stopped answering entirely.",
  },
  {
    firstName: "Mireille", lastName: "Dubois",
    company: "Atelier Brand Studio", handle: "@mireille.atelier",
    email: "mireille@atelierbrand.studio", website: "atelierbrand.studio",
    niche: "Personal branding for consultants", offerType: "Done-for-you",
    monthlyRevenue: 48_000, source: "referral", owner: "kavi",
    value: 4_000, valueType: "monthly_recurring",
    reached: FUNNEL.inSequence, ageInStage: 4,
    tags: ["agency", "referral"],
    research: "$6k done-for-you brand sprints, roughly eight a month. Delivery heavy, sales light.",
    angle: "Referred by Colin. Worth a warm mention of him in the first message.",
  },
  {
    firstName: "Jonah", lastName: "Steinberg",
    company: "Remote Dev Academy", handle: "@jonahsteinberg",
    email: "jonah@remotedevacademy.com", website: "remotedevacademy.com",
    niche: "Junior developer bootcamp", offerType: "Cohort course",
    monthlyRevenue: 85_000, source: "inbound", owner: "riley",
    value: 5_500, valueType: "monthly_recurring",
    reached: FUNNEL.closing, ageInStage: 5,
    skipped: [FUNNEL.researched],
    tags: ["education", "high-intent"],
    research: "$3,900 bootcamp, monthly intakes of 25 to 40. Fills off affiliate YouTubers, which is getting expensive.",
    angle: "Affiliate economics are tightening. He needs a channel he owns.",
  },
  {
    firstName: "Tallulah", lastName: "Reyes",
    company: "Cycle Sync Coaching", handle: "@tallulah.cyclesync",
    email: "tallulah@cyclesync.co", website: "cyclesync.co",
    niche: "Hormone and cycle health coaching", offerType: "Membership",
    monthlyRevenue: 26_000, source: "cold_email", owner: "kavi",
    value: 2_500, valueType: "monthly_recurring",
    reached: FUNNEL.inSequence, ageInStage: 13,
    tags: ["health", "membership"],
    research: "$59/mo membership, about 400 members. Heavy TikTok presence, almost no email.",
    angle: "Audience lives on a platform she does not control and cannot contact directly.",
  },
  {
    firstName: "Barrett", lastName: "Cole",
    company: "Dad Bod Demolition", handle: "@barrettcole",
    email: "barrett@dadboddemolition.com", website: "dadboddemolition.com",
    niche: "Fitness for men over 40", offerType: "Group coaching",
    monthlyRevenue: 40_000, source: "ig_dm", owner: "riley",
    value: 3_500, valueType: "monthly_recurring",
    reached: FUNNEL.newLead, ageInStage: 1,
    tags: ["fitness"],
    research: "Found via the fitness coach scrape. 38k followers, posts daily, offer is a $197/mo group.",
    angle: "Not researched yet.",
  },
  {
    firstName: "Sunita", lastName: "Deshpande",
    company: "Fluent in Ninety", handle: "@sunita.fluent",
    email: "sunita@fluentinninety.com", website: "fluentinninety.com",
    niche: "Conversational Spanish for adults", offerType: "Evergreen course",
    monthlyRevenue: 55_000, source: "list_import", owner: "kavi",
    value: 3_000, valueType: "monthly_recurring",
    reached: FUNNEL.researched, ageInStage: 9,
    tags: ["education", "info-product"],
    research: "$697 course on evergreen webinar. Roughly 80 sales a month. Runs everything herself.",
    angle: "Solo operator at $55k/mo. Capacity, not demand, is the ceiling.",
  },
  {
    firstName: "Kwame", lastName: "Boateng",
    company: "Court to Career", handle: "@kwameboateng",
    email: "kwame@courttocareer.com", website: "courttocareer.com",
    niche: "Career transition coaching for retired athletes", offerType: "1:1 coaching",
    monthlyRevenue: 20_000, source: "referral", owner: "riley",
    value: 2_500, valueType: "monthly_recurring",
    reached: FUNNEL.callBooked, ageInStage: 4,
    tags: ["coaching", "referral"],
    research: "$1,500/mo 1:1, about 13 clients. Comes entirely through two agents who send him players.",
    angle: "Same single-channel risk as Renata, but with a much clearer niche to build outbound on.",
  },
  {
    firstName: "Elena", lastName: "Marchetti",
    company: "Scale Your Studio", handle: "@elena.scalestudio",
    email: "elena@scaleyourstudio.com", website: "scaleyourstudio.com",
    niche: "Business coaching for pilates studio owners", offerType: "Group coaching",
    monthlyRevenue: 33_000, source: "cold_email", owner: "kavi",
    value: 3_000, valueType: "monthly_recurring",
    reached: FUNNEL.inSequence, ageInStage: 13,
    lostInSequence: true,
    lost: { reason: "No response across five touches. Workshop season, likely buried." },
    tags: ["coaching", "b2b"],
    research: "$497/mo group for studio owners, 66 members. Sells at live workshops, nothing in between.",
    angle: "Revenue is lumpy around workshops. Nothing sells on the other ten months.",
  },
  {
    firstName: "Rhys", lastName: "Donnelly",
    company: "Ghostwriter Guild", handle: "@rhysdonnelly",
    email: "rhys@ghostwriterguild.com", website: "ghostwriterguild.com",
    niche: "Ghostwriting business training", offerType: "Membership",
    monthlyRevenue: 75_000, source: "ig_dm", owner: "riley",
    value: 4_500, valueType: "monthly_recurring",
    reached: FUNNEL.inSequence, ageInStage: 26,
    lostInSequence: true,
    lost: { reason: "Five DMs, nothing back. Posts daily, so this is a priority problem rather than a reach problem." },
    tags: ["info-product", "membership"],
    research: "$99/mo guild, roughly 760 members. Sells off X almost entirely, one thread at a time.",
    angle: "Platform risk plus no email capture on a 760-member business.",
  },
  {
    firstName: "Yara", lastName: "Haddad",
    company: "The Founder Reset", handle: "@yara.founderreset",
    email: "yara@founderreset.com", website: "founderreset.com",
    niche: "Burnout coaching for startup founders", offerType: "1:1 coaching",
    monthlyRevenue: 30_000, source: "inbound", owner: "kavi",
    value: 3_500, valueType: "monthly_recurring",
    reached: FUNNEL.won, ageInStage: 5,
    skipped: [FUNNEL.researched],
    tags: ["coaching", "high-intent"],
    research: "$2,500/mo retainer with founders, 12 clients. Came in through the newsletter.",
    angle: "Already sold before the first call. Wanted to know start date, not price.",
  },
  {
    firstName: "Oskar", lastName: "Nowak",
    company: "Print on Demand Pro", handle: "@oskarnowak.pod",
    email: "oskar@printondemandpro.com", website: "printondemandpro.com",
    niche: "Print on demand ecommerce training", offerType: "Evergreen course",
    monthlyRevenue: 110_000, source: "cold_email", owner: "riley",
    value: 6_500, valueType: "one_time",
    reached: FUNNEL.closing, ageInStage: 17,
    lost: { reason: "Hired two setters in-house the week after the call. Said revisit in Q2." },
    tags: ["info-product", "ecommerce"],
    research: "$997 course, roughly 110 sales a month off TikTok and a free community.",
    angle: "Good call, real problem, wrong timing. Worth a revisit note rather than a delete.",
  },
  {
    firstName: "Camille", lastName: "Fortier",
    company: "Bilingual Birth", handle: "@camille.bilingualbirth",
    email: "camille@bilingualbirth.ca", website: "bilingualbirth.ca",
    niche: "Doula training in French and English", offerType: "Certification",
    monthlyRevenue: 24_000, source: "list_import", owner: "kavi",
    value: 2_000, valueType: "monthly_recurring",
    reached: FUNNEL.newLead, ageInStage: 5,
    tags: ["education"],
    research: "From the certification providers list. Bilingual angle is unusual and probably defensible.",
    angle: "Needs research before contact. Unclear whether the business is big enough.",
  },
  {
    firstName: "Terrence", lastName: "Vaughn",
    company: "Blueprint Barbell", handle: "@terrencevaughn",
    email: "terrence@blueprintbarbell.com", website: "blueprintbarbell.com",
    niche: "Powerlifting programming", offerType: "App plus 1:1",
    monthlyRevenue: 52_000, source: "ig_dm", owner: "riley",
    value: 4_000, valueType: "monthly_recurring",
    reached: FUNNEL.replied, ageInStage: 1,
    tags: ["fitness", "warm"],
    research: "$29/mo app, 1,100 subscribers, plus $350/mo 1:1 for about 30 people.",
    angle: "Replied within an hour asking what we charge. Move fast on this one.",
  },
  {
    firstName: "Anouk", lastName: "Vermeer",
    company: "Slow Money Club", handle: "@anouk.slowmoney",
    email: "anouk@slowmoney.club", website: "slowmoney.club",
    niche: "Personal finance for creatives", offerType: "Membership",
    monthlyRevenue: 38_000, source: "cold_email", owner: "kavi",
    value: 3_000, valueType: "monthly_recurring",
    reached: FUNNEL.inSequence, ageInStage: 22,
    lostInSequence: true,
    lost: { reason: "Went cold after four touches. Break-up email was opened, still no reply." },
    tags: ["membership", "finance"],
    research: "$45/mo club, roughly 840 members, strong community, weak funnel.",
    angle: "Four touches in, no reply. Worth one final break-up email before parking it.",
  },
  {
    firstName: "Malik", lastName: "Osei",
    company: "Faceless YouTube Lab", handle: "@malikosei",
    email: "malik@facelessyoutubelab.com", website: "facelessyoutubelab.com",
    niche: "Faceless YouTube channel training", offerType: "Cohort course",
    monthlyRevenue: 160_000, source: "ig_dm", owner: "riley",
    value: 8_500, valueType: "rev_share_estimate",
    reached: FUNNEL.closing, ageInStage: 9,
    tags: ["info-product", "high-ticket", "rev-share"],
    research: "$2,997 cohort, six figures a month, wants a performance deal rather than a retainer.",
    angle: "Only one asking for rev share. Proposal is built around a percentage of new cash collected.",
  },
  {
    firstName: "Bridget", lastName: "Kavanagh",
    company: "Pitch Perfect PR", handle: "@bridgetkavanagh",
    email: "bridget@pitchperfectpr.ie", website: "pitchperfectpr.ie",
    niche: "PR coaching for ecommerce founders", offerType: "Done-for-you",
    monthlyRevenue: 44_000, source: "referral", owner: "kavi",
    value: 3_500, valueType: "monthly_recurring",
    reached: FUNNEL.inSequence, ageInStage: 2,
    tags: ["agency", "referral"],
    research: "$4k/mo PR retainers, nine clients. Referred by Mireille.",
    angle: "Warm intro already made. First message can skip the pitch entirely.",
  },
  {
    firstName: "Sergio", lastName: "Pastrana",
    company: "Recovery Room Method", handle: "@sergio.recoveryroom",
    email: "sergio@recoveryroommethod.com", website: "recoveryroommethod.com",
    niche: "Recovery coaching and sober community", offerType: "Group coaching",
    monthlyRevenue: 29_000, source: "list_import", owner: "riley",
    value: 2_500, valueType: "monthly_recurring",
    reached: FUNNEL.researched, ageInStage: 3,
    tags: ["coaching", "community"],
    research: "$199/mo group, about 145 members. Sensitive niche, ad accounts get flagged constantly.",
    angle: "Paid is effectively closed to him, which makes organic outbound the only route.",
  },
  {
    firstName: "Ingrid", lastName: "Sorensen",
    company: "Nordic Nomad Academy", handle: "@ingrid.nordicnomad",
    email: "ingrid@nordicnomad.academy", website: "nordicnomad.academy",
    niche: "Remote work and relocation training", offerType: "Evergreen course",
    monthlyRevenue: 65_000, source: "inbound", owner: "kavi",
    value: 4_000, valueType: "monthly_recurring",
    reached: FUNNEL.callBooked, ageInStage: 2,
    skipped: [FUNNEL.researched],
    tags: ["education", "info-product", "high-intent"],
    research: "$1,200 course plus a $89/mo community. Found us through the case study page.",
    angle: "Booked straight off the site. Knows the offer, wants to talk scope.",
  },
];
