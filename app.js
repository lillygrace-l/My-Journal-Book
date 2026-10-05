/** My Journal Book - local journal UI, storage, insights and AI actions. */
import { initAI, generateReflectionQuestions, generateIdeaForMood, generateReflectionSummary, generateSelectedPagesReflection, generateJournalObservations, generateCarryingReflection, selectModel } from "./ai.js?v=ollama-3";

const STORAGE_KEY = "offline-journal:entries";
const SETTINGS_KEY = "offline-journal:settings";
const CRISIS_WORDS = ["hurt myself", "suicide", "end it all"];
const MOODS = ["anxious", "grateful", "reflective", "bored"];
let currentQuestions = [];
let editingId = null;
let selectedDetailId = null;
let calendarCursor = new Date();
let selectedCalendarDate = null;
let selectedIdeaMode = "";
let followupContextId = null;
const selectedPageIds = new Set();
let selectedLibraryId = null;

const $ = (id) => document.getElementById(id);
const entryText = $("entry-text"), btnQuestions = $("btn-questions"), btnSave = $("btn-save"), questionsResult = $("questions-result"), questionsList = $("questions-list");
const btnIdea = $("btn-idea"), btnUseIdea = $("btn-use-idea"), ideaResult = $("idea-result"), ideaText = $("idea-text"), btnSurprise = $("btn-surprise");
const historyList = $("history-list"), historyEmpty = $("history-empty"), historyNoResults = $("history-no-results");
const modelStatus = $("model-status"), modelText = $("model-text"), modelProgress = $("model-progress"), btnConnect = $("btn-connect"), modelSelect = $("ollama-model");
const tabWrite = $("t-write"), tabIdeas = $("t-ideas"), tabHistory = $("t-history"), tabExplore = $("t-explore");

function loadEntries() {
  try { const raw = localStorage.getItem(STORAGE_KEY); const parsed = raw ? JSON.parse(raw) : []; return Array.isArray(parsed) ? parsed : []; }
  catch (err) { console.error("Storage read error:", err); return []; }
}
function saveEntries(entries) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); return true; }
  catch (err) { console.error("Storage write error:", err); alert("Unable to save entry. Storage might be full."); return false; }
}
function loadSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch { return {}; } }
function saveSettings(next) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {} }
function getSetting(key, fallback) { const s = loadSettings(); return s[key] === undefined ? fallback : s[key]; }
function escapeDate(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? new Date() : d; }
function localDateKey(value) { const d = escapeDate(value); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); }
function formatDate(dateString, opts = {}) { const d = escapeDate(dateString); return { iso: localDateKey(d), label: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...opts }) }; }
function formatLongDate(dateString) { return escapeDate(dateString).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }); }
function dateKey(value) { return localDateKey(value); }
function normalizeEntry(entry) { return { ...entry, tags: Array.isArray(entry.tags) ? entry.tags : [], favorite: Boolean(entry.favorite), mood: MOODS.includes(entry.mood) ? entry.mood : "", questions: Array.isArray(entry.questions) ? entry.questions : [] }; }
function words(text) { return (text.trim().match(/\S+/g) || []).length; }
function readTime(text) { return Math.max(0, Math.ceil(words(text) / 180)); }
function hasCrisisKeywords(text) { const lower = text.toLowerCase(); return CRISIS_WORDS.some((word) => lower.includes(word)); }
function parseTags(value) { return [...new Set(value.split(/[ ,]+/).map((tag) => tag.trim().replace(/^#/, "").toLowerCase()).filter(Boolean))].slice(0, 8); }
function moodLabel(mood) { return mood ? mood[0].toUpperCase() + mood.slice(1) : ""; }

const IDEA_PROMPTS = {
  curious: {
    tiny: ["What have you been wondering about lately?"],
    explore: ["What is something you want to understand better, and why does it keep pulling at your attention?"],
    deep: ["What question keeps returning to you, and what might your life look like if you followed it instead of dismissing it?"]
  },
  letter: {
    tiny: ["Write one sentence to your future self."],
    explore: ["Write a letter to someone you wish you could talk to for five quiet minutes."],
    deep: ["Write the letter you have been carrying in your head but never found the right moment to send."]
  },
  heavy: {
    tiny: ["What feels a little heavier than usual today?"],
    explore: ["What are you tired of carrying that you don't have to solve tonight?"],
    deep: ["If you could put one difficult thing down without explaining or fixing it, what would you place on the page?"]
  },
  imagine: {
    tiny: ["What would make tomorrow feel unexpectedly good?"],
    explore: ["Describe your dream ordinary Tuesday, from morning to night."],
    deep: ["Imagine your life one year from now if you gave yourself permission to choose what actually matters to you. What changed?"]
  },
  future: {
    tiny: ["Dear future me, what do I hope you remember about this ordinary moment?"],
    explore: ["Dear future me, here is what life feels like right now. What do I hope has changed, and what do I hope has stayed?"],
    deep: ["Write to a version of you one year from now. Tell them what you are learning, what you are scared of, and what you quietly hope they will thank you for."]
  }
};
const MISSIONS = [
  ["The Three Things", "Write three things: something you noticed, something you felt, and something you didn't say."],
  ["The One-Minute Page", "Write continuously for one minute. Don't delete, polish, or explain anything."],
  ["The Unsent Letter", "Write something you would never actually send. Let the page receive the whole thing."],
  ["The Ordinary Day", "Describe today as if someone fifty years from now discovered this page."],
  ["The Tiny Victory", "Write about something you did right that nobody noticed."],
  ["The Photograph", "Describe one moment from today as if you were taking a photograph with words."]
];
const MARGIN_NOTES = [
  "You don't need a big thought to write a page. Sometimes, “the fan was making a weird sound today” is enough to begin.",
  "A journal can hold the unfinished version too. You don't have to understand a feeling before you write it down.",
  "Small details are not filler. Someday, they may be the part you remember first.",
  "You are allowed to write badly here. The page is not asking you to perform.",
  "Start with the sentence you almost skipped. It might be the interesting one."
];

const REFLECTION_LIBRARY = [
  { title: "Self-Sabotaging Patterns", items: [
    ["Procrastination", "Putting off a task can sometimes be a way of protecting yourself from pressure, uncertainty, or judgment.", "You may feel relief while avoiding it, then more pressure as the task gets closer.", "Waiting for the right mood, over-preparing, or doing easier tasks instead.", "Avoidance buys relief now but often hands the pressure to tomorrow.", "I can begin before I feel completely ready.", "What are you afraid might happen once you start?", ["Perfectionism","Fear of Failure","Overthinking"]],
    ["Perfectionism", "Holding yourself to an impossible standard can turn meaningful work into a test of worth.", "Small imperfections may feel much bigger than they look from the outside.", "Endless editing, delayed starts, or feeling finished only when everything is flawless.", "The higher the standard, the harder it becomes to let a page be simply done.", "Good enough can still be honest, useful, and worth sharing.", "Where are you asking yourself to be flawless instead of finished?", ["Procrastination","Self-Criticism","Fear of Failure"]],
    ["Fear of Failure", "Fear of failure can make a choice feel like a verdict on who you are, rather than one result from one attempt.", "You may feel exposed before you have even begun.", "Avoiding chances, choosing the safest option, or rehearsing every possible mistake.", "If failure feels like identity, avoiding the attempt can feel safer than learning.", "A result can teach me something without defining me.", "What would you try if failure were allowed to be information?", ["Perfectionism","Self-Doubt","Impostor Feelings"]],
    ["Fear of Success", "Sometimes moving toward something good can bring its own uncertainty: more expectations, visibility, or change.", "Excitement may sit beside guilt, doubt, or the urge to pull back.", "Downplaying wins, delaying opportunities, or finding reasons not to take the next step.", "Keeping a goal out of reach protects you from the changes that could come with reaching it.", "I can grow into a good thing gradually.", "What feels unfamiliar about things going well?", ["Impostor Feelings","People Pleasing","Self-Doubt"]],
    ["Impostor Feelings", "Feeling like you have somehow slipped into a role you do not deserve can make real progress hard to trust.", "Success may feel lucky while mistakes feel like proof.", "Comparing yourself with others, hiding uncertainty, or waiting to feel qualified enough.", "Discounting evidence of competence keeps the feeling of being an outsider alive.", "Not feeling confident yet does not erase what I have already learned.", "What evidence of your own competence are you overlooking?", ["Chronic Comparison","Fear of Failure","Difficulty Receiving Compliments"]],
    ["Overcommitting", "Saying yes to too many things can come from enthusiasm, guilt, fear of disappointing people, or difficulty noticing your own limits.", "You may feel useful and overwhelmed at the same time.", "Packed schedules, postponed personal needs, or resentment after agreeing.", "Every yes can hide a no to your time, rest, or priorities.", "A smaller yes can be a more honest yes.", "Which commitment would you choose differently if you were not afraid of disappointing anyone?", ["People Pleasing","Difficulty Saying No","Suppressing Needs"]]
  ]},
  { title: "People-Pleasing Patterns", items: [
    ["People Pleasing", "Automatically prioritizing other people's comfort can make your own wants harder to hear.", "You may feel safe when everyone is happy and uneasy when someone might be disappointed.", "Agreeing quickly, avoiding conflict, or shaping your choices around other people's reactions.", "Short-term harmony can come at the cost of long-term honesty.", "Someone else's disappointment does not automatically mean I did something wrong.", "What did you want to say today before you started thinking about everyone else's reaction?", ["Difficulty Saying No","Seeking External Validation","Suppressing Needs"]],
    ["Difficulty Saying No", "A hard time saying no can make boundaries feel like rejection rather than a normal part of caring for yourself.", "You may feel guilty before you have even decided.", "Long explanations, hesitant answers, or agreeing and regretting it later.", "The fear of one uncomfortable moment keeps creating many overloaded ones.", "A clear no can be kinder than an unwilling yes.", "What would a simple, honest no sound like here?", ["People Pleasing","Overcommitting","Suppressing Needs"]],
    ["Seeking External Validation", "Looking outward for reassurance can make your sense of okayness depend on other people's reactions.", "Praise can feel wonderful but temporary, while silence feels loaded.", "Checking responses, second-guessing choices, or needing someone else to confirm you are doing well.", "External reassurance settles the doubt briefly without teaching you to trust your own judgment.", "I can value feedback without handing it the final word.", "Where are you waiting for someone else to tell you that your choice is okay?", ["Difficulty Accepting Compliments","People Pleasing","Chronic Comparison"]],
    ["Over-Apologizing", "Saying sorry for taking up space, having needs, or making ordinary mistakes can turn accountability into self-erasure.", "You may apologize before anyone has even said there is a problem.", "Sorry for asking, sorry for needing, sorry for being late, sorry for existing too loudly.", "Apology becomes a way to reduce the risk of disapproval.", "I can repair a real mistake without apologizing for being human.", "What are you apologizing for that does not actually require an apology?", ["Low Self-Worth","People Pleasing","Suppressing Needs"]],
    ["Suppressing Needs", "Keeping your wants quiet can feel safer than risking conflict, inconvenience, or being called difficult.", "You may know what you need only after you are already exhausted.", "Saying “it is fine”, adapting silently, or feeling resentful later.", "When needs stay unspoken, other people cannot respond to information they never received.", "My needs are information, not an inconvenience.", "What need have you been making smaller so it is easier for someone else?", ["Difficulty Saying No","People Pleasing","Low Self-Worth"]],
    ["Mirroring Others to Fit In", "Changing your tone, opinions, or preferences to match a group can help you belong while making your own voice harder to notice.", "You may feel accepted and strangely absent at the same time.", "Adopting preferences quickly, agreeing automatically, or leaving interactions unsure what you actually thought.", "Blending in can become so automatic that authenticity starts to feel risky.", "Belonging does not require me to disappear into the room.", "What opinion or preference would you keep if nobody else had one?", ["People Pleasing","Chronic Comparison","Fear of Being Seen"]],
    ["Feeling Responsible for Everyone's Emotions", "Taking ownership of other people's moods can leave you constantly scanning for what needs to be fixed.", "Someone's disappointment can feel like your personal emergency.", "Trying to smooth every conflict, anticipating reactions, or changing plans to keep the peace.", "The more you manage other people's feelings, the less room you have to experience your own.", "I can care without becoming responsible for every feeling around me.", "Which emotion in the room are you treating as your job to fix?", ["People Pleasing","Overcommitting","Suppressing Needs"]]
  ]},
  { title: "Identity Patterns", items: [
    ["Low Self-Worth", "A low sense of worth can make ordinary mistakes or needs feel like evidence that you matter less.", "You may struggle to receive kindness without questioning whether you deserve it.", "Settling for less, minimizing achievements, or expecting others to matter more.", "Self-doubt changes what evidence you allow yourself to believe.", "My worth does not need to be earned every morning.", "Where are you treating your value like something you have to prove?", ["Negative Self-Talk","Difficulty Receiving Compliments","Feeling Like a Burden"]],
    ["Negative Self-Talk", "A harsh inner voice can become so familiar that criticism starts to sound like truth.", "The same mistake feels louder when the voice narrating it is unforgiving.", "Calling yourself lazy, stupid, behind, difficult, or never enough.", "Repetition makes the inner critic feel authoritative even when it is inaccurate.", "I can correct myself without becoming cruel to myself.", "What would you say to a friend who made the exact mistake you made?", ["Low Self-Worth","Self-Criticism","Should Statements"]],
    ["Chronic Comparison", "Constantly measuring yourself against other people can turn someone else's life into a scoreboard for your own.", "You may feel behind even when your own life is moving.", "Checking peers, comparing timelines, or noticing your gap before your progress.", "Comparison removes context: you see their visible result and your invisible uncertainty.", "Someone else's timeline is not evidence that mine is wrong.", "Whose life are you using as a measuring stick right now?", ["Impostor Feelings","Feeling Behind","Seeking External Validation"]],
    ["Feeling Like a Burden", "Believing your needs cost other people too much can make receiving care uncomfortable.", "You may want support and apologize for needing it at the same time.", "Avoiding asks, minimizing problems, or saying “do not worry about me” when you need help.", "Expecting yourself to need nothing prevents others from choosing to care for you.", "Being cared for is part of being human, not a debt.", "What support would you accept if you did not have to earn it first?", ["Low Self-Worth","Suppressing Needs","Over-Apologizing"]],
    ["Difficulty Accepting Compliments", "Deflecting praise can make positive evidence harder to keep.", "A kind sentence may create discomfort rather than relief.", "Joking away praise, arguing with it, or immediately naming what went wrong instead.", "The habit protects you from feeling exposed but also blocks encouragement.", "I can receive a good thing without explaining it away.", "What compliment do you most want to believe, but keep talking yourself out of?", ["Impostor Feelings","Low Self-Worth","Seeking External Validation"]],
    ["Difficulty Receiving Love", "When closeness feels unfamiliar or unsafe, care can be hard to trust even when it is genuinely offered.", "Affection may bring warmth and vulnerability at the same time.", "Pulling away after connection, questioning motives, or feeling uncomfortable when someone shows up for you.", "Distance can feel safer than the uncertainty of being fully cared for.", "I can let good care arrive at a pace I can handle.", "What makes receiving kindness feel more vulnerable than giving it?", ["Feeling Like a Burden","Fear of Being Seen","Low Self-Worth"]],
    ["Not Knowing What You Want", "When your choices are shaped by expectations for long enough, your own preferences can become quiet or confusing.", "You may know what you should do before you know what you want.", "Endless options, asking everyone else, or choosing the path that seems most acceptable.", "Borrowed priorities can drown out small signals of genuine interest.", "I can start with what feels slightly more alive, not perfectly certain.", "What would you choose if nobody needed an explanation?", ["People Pleasing","Chronic Comparison","Suppressing Needs"]],
    ["Fear of Being Seen", "Being visible can feel risky when attention is associated with judgment, rejection, or expectations.", "You may want recognition and hide from it at the same time.", "Holding back ideas, avoiding photos, or staying quiet even when you have something to say.", "Staying hidden lowers immediate risk but also limits the experience of being known.", "Visibility can happen in small, chosen doses.", "What part of you would you like someone safe to see more clearly?", ["Impostor Feelings","Difficulty Receiving Compliments","Mirroring Others to Fit In"]]
  ]},
  { title: "Thinking Patterns", items: [
    ["Black-and-White Thinking", "Seeing a situation as all good or all bad can make the middle disappear.", "One mistake can feel like the whole story.", "Words like always, never, everyone, no one, ruined, perfect.", "Certainty can feel simpler than holding two truths at once.", "Something can be difficult and still contain something good.", "What is the middle version of this story?", ["Perfectionism","Should Statements","Focusing Only on the Negative"]],
    ["Mind Reading", "Assuming you know what other people think can turn guesses into facts before anyone speaks.", "Silence or a small reaction may feel full of meaning.", "Interpreting tone, delayed replies, or facial expressions without checking.", "The brain fills gaps quickly when uncertainty feels uncomfortable.", "A guess is not a fact until I have more information.", "What do you know, and what are you assuming?", ["Seeking External Validation","Personalization","Fortune-Telling"]],
    ["Fortune-Telling", "Predicting a negative future can make an imagined outcome feel inevitable.", "You may feel disappointed or afraid before the event has happened.", "“This will go badly”, “They will reject me”, or rehearsing disasters.", "Predicting danger can feel like preparation, but it may also keep you from discovering what is actually true.", "I can prepare without pretending I know the future.", "What other outcomes are possible besides the one you fear?", ["Fear of Failure","Overthinking","Mind Reading"]],
    ["Should Statements", "A heavy collection of shoulds can turn choices into moral tests.", "Rest can feel guilty and mistakes can feel like failure to meet a rule.", "“I should be further along”, “I should want this”, “I should have known.”", "Unquestioned rules create shame whenever reality refuses to match them.", "I can replace “should” with “I want”, “I choose”, or “I need”.", "Which should in your head is actually someone else's expectation?", ["Feeling Behind","Perfectionism","Negative Self-Talk"]],
    ["Personalization", "Taking events personally can make more situations feel like reflections of your worth or responsibility.", "Someone else's mood can quickly become a verdict on you.", "Blaming yourself for outcomes you only partly control.", "Owning everything creates an illusion of control while adding unnecessary guilt.", "I can own my part without owning the whole situation.", "What part is actually yours, and what belongs to someone or something else?", ["People Pleasing","Feeling Responsible for Everyone's Emotions","Low Self-Worth"]],
    ["Focusing Only on the Negative", "A negative filter can make difficult details more memorable than everything that went right.", "A whole day may feel bad because of one painful moment.", "Replaying errors, dismissing wins, or scanning for what went wrong.", "Attention follows threat easily, which can make the good harder to retain.", "Both the difficult part and the good part can be true.", "What did your attention skip because one thing felt wrong?", ["Negative Self-Talk","Chronic Comparison","Should Statements"]],
    ["Overthinking Decisions", "Thinking carefully can become exhausting when more thought stops producing more clarity.", "Every choice feels like it needs a guarantee.", "Repeated pros and cons, asking many people, or revisiting a choice after making it.", "More analysis can feel like control when the real issue is uncertainty.", "I can make a thoughtful choice without making a perfect one.", "What would be enough information to move forward?", ["Fortune-Telling","Perfectionism","Not Knowing What You Want"]]
  ]},
  { title: "Feelings", items: [
    ["Anxiety", "A state of worry, tension, or anticipation that can make uncertainty feel especially loud.", "Your mind may run ahead while your body stays on alert.", "Restlessness, over-preparing, repeated checking, or difficulty settling.", "Trying to eliminate every uncertainty can keep your attention locked on what might happen.", "I can notice uncertainty without solving all of it right now.", "What is your mind trying to protect you from today?", ["Overthinking","Fortune-Telling","Feeling Stuck"]],
    ["Sadness", "Sadness can be a response to loss, disappointment, loneliness, change, or simply a hard day.", "Energy may soften and ordinary things may require more effort.", "Pulling inward, crying, low motivation, or wanting quiet.", "Sometimes pressure to “get over it” adds a second layer of difficulty.", "I do not have to turn a feeling into a failure.", "What does your sadness seem to be asking to be acknowledged?", ["Grief","Loneliness","Feeling Stuck"]],
    ["Loneliness", "Loneliness is the feeling of missing meaningful connection, even when other people are nearby.", "You may feel unseen rather than simply alone.", "Withdrawing, scrolling for connection, or wishing one person would notice.", "Protecting yourself from rejection can also reduce opportunities for closeness.", "Connection can start small; I do not need to solve loneliness all at once.", "What kind of connection are you actually missing?", ["Feeling Left Out","Difficulty Receiving Love","Friendship Struggles"]],
    ["Overwhelm", "Overwhelm can happen when the demands in front of you feel larger than the attention or energy available.", "Everything can feel urgent at once.", "Jumping between tasks, freezing, forgetting, or wanting to escape the list.", "Treating every demand as equally important makes it hard to find the next small step.", "I only need to decide what matters next, not everything at once.", "What is the one thing that truly needs your attention first?", ["Overcommitting","Burnout","Procrastination"]],
    ["Burnout", "Burnout can feel like prolonged depletion after sustained stress, pressure, or effort without enough recovery.", "Rest may not feel restorative, and even small tasks can feel expensive.", "Cynicism, exhaustion, numbness, reduced patience, or difficulty starting.", "Continuing to push through can make recovery harder.", "Recovery is part of the work, not a reward for finishing it.", "What has been asking more from you than it has been giving back?", ["Overcommitting","Overwhelm","Academic Pressure"]],
    ["Feeling Stuck", "Feeling stuck can mean knowing that something is not working while not seeing a believable next move.", "Time moves but the situation feels paused.", "Avoiding decisions, repeating the same routine, or waiting for motivation.", "When the next step feels too large, doing nothing can feel safer than choosing badly.", "The next step can be tiny and imperfect.", "What is one movement that would count as forward, even if it changes nothing else yet?", ["Procrastination","Not Knowing What You Want","Decision Making"]],
    ["Low Confidence", "Low confidence is the feeling that you may not be capable enough, even when the evidence is mixed or incomplete.", "You may want reassurance before you trust yourself.", "Holding back, over-preparing, or waiting to feel certain.", "Confidence often arrives after action, but waiting for it can block the action that would build it.", "I can act with some doubt still present.", "Where could you practice before you feel ready?", ["Impostor Feelings","Fear of Failure","Negative Self-Talk"]],
    ["Feeling Behind", "Feeling behind happens when your life is judged against a timeline that says you should be further along.", "Other people's milestones can make your own progress disappear.", "Comparing ages, grades, careers, relationships, money, or achievements.", "A borrowed timeline creates pressure even when your actual priorities have changed.", "There is no universal schedule for becoming a person.", "Behind according to whose timeline?", ["Chronic Comparison","Should Statements","Not Knowing What You Want"]],
    ["Grief", "Grief can follow a loss, but it can also follow the end of a relationship, expectation, phase, or version of life.", "Feelings may arrive unevenly rather than in a neat order.", "Longing, anger, numbness, memories, or sudden changes in emotion.", "Expecting grief to be linear can make normal fluctuation feel like failure.", "I can let this change shape without needing to rush it.", "What part of what was lost do you miss most today?", ["Sadness","Relationship Struggles","Major Change"]],
    ["Uncertainty", "Uncertainty is the discomfort of not yet knowing what happens next or what choice is right.", "Your mind may keep asking for an answer that is not available yet.", "Repeated checking, reassurance seeking, postponing, or making contingency plans.", "Trying to force certainty can create more mental noise than clarity.", "I can make room for not knowing yet.", "What can you decide now, and what truly has to wait?", ["Overthinking","Fortune-Telling","Decision Making"]]
  ]},
  { title: "Life Situations", items: [
    ["Relationship Struggles", "Tension in a close relationship can bring up needs, expectations, communication gaps, and old ways of protecting yourself.", "You may feel close and disconnected in the same week.", "Repeating arguments, uncertainty, resentment, distance, or difficulty asking for what you need.", "Unspoken needs can turn small moments into evidence for larger fears.", "I can describe the situation and my part without reducing either person to a label.", "What do you wish the other person understood about your experience?", ["Difficulty Saying No","Suppressing Needs","Fear of Being Seen"]],
    ["Friendship Struggles", "Friendship tension can be especially confusing when belonging, loyalty, and changing expectations overlap.", "You may wonder whether to reach out, step back, or say something honestly.", "Feeling left out, uneven effort, changed routines, or avoiding a needed conversation.", "Guessing what the other person feels can keep the actual conversation from happening.", "I can name what I miss, what I need, and what I can control.", "What would you want this friendship to feel like from here?", ["Loneliness","People Pleasing","Seeking External Validation"]],
    ["Family Tension", "Family tension can carry both present-day issues and long histories of expectations or roles.", "Small interactions may feel bigger because they have a long memory.", "Avoidance, repeated conflict, guilt, walking on eggshells, or changing yourself to keep peace.", "Old roles can make it difficult to notice who you are in the present.", "I can choose the boundary that fits the person I am now.", "Which family role are you tired of playing?", ["Difficulty Saying No","Feeling Responsible for Everyone's Emotions","Suppressing Needs"]],
    ["Academic Pressure", "Academic pressure can make performance, identity, and future plans feel tightly connected.", "One grade can feel like a statement about your whole potential.", "Cramming, procrastination, comparison, sleep loss, or fear around exams and deadlines.", "Treating every result as high-stakes can make learning harder.", "A grade is feedback on work, not a final description of me.", "What part of academic pressure is actually about the work, and what part is about what it means about you?", ["Perfectionism","Fear of Failure","Feeling Behind"]],
    ["Work Pressure", "Work pressure can build when demands, expectations, and available time stop matching.", "You may feel guilty even while doing a lot.", "Long hours, overcommitting, constant checking, or difficulty switching off.", "Being always available can slowly make recovery feel unearned.", "My attention has limits, and limits make sustained work possible.", "What boundary would protect your energy without requiring a perfect solution?", ["Overcommitting","Burnout","Difficulty Saying No"]],
    ["Major Change", "A major change can unsettle routines, relationships, identity, and the sense of what comes next.", "Excitement and grief can sit side by side.", "Second-guessing, nostalgia, uncertainty, or feeling unlike your old self.", "Comparing every new moment with the old one can delay the process of adapting.", "I can miss what was while learning what is next.", "What are you allowed to stop being because life has changed?", ["Grief","Uncertainty","Feeling Stuck"]],
    ["Failure / Setback", "A setback is an outcome that did not match what you hoped for; it does not need to become a permanent identity label.", "Disappointment can quickly turn into shame or withdrawal.", "Replaying what went wrong, hiding the result, or avoiding another attempt.", "When one result becomes a story about your future, the learning gets harder to see.", "This happened. I can decide what it means next.", "What did the setback teach you that success might not have shown?", ["Fear of Failure","Negative Self-Talk","Perfectionism"]],
    ["Decision Making", "Decision making becomes difficult when several choices carry real trade-offs and no option comes with certainty.", "You may want a guarantee before choosing.", "Delaying, asking many people, changing your mind, or obsessing over edge cases.", "Trying to eliminate all regret can keep you from choosing anything.", "A good decision can still contain some loss.", "Which option fits the person you are becoming, not just the version you are trying to protect?", ["Overthinking Decisions","Uncertainty","Not Knowing What You Want"]],
    ["Feeling Left Out", "Feeling left out is the ache of seeing connection happen without feeling included in it.", "It can make small social details feel unusually loud.", "Checking group chats, replaying invitations, or assuming the omission means something about your worth.", "The mind may treat one moment of exclusion as evidence of a larger pattern.", "I can acknowledge the hurt without turning it into a verdict about me.", "What kind of belonging would feel genuine rather than simply being included?", ["Loneliness","Chronic Comparison","Low Self-Worth"]],
    ["Life Direction", "Questions about life direction often appear when an old path no longer feels automatic and a new one is not yet clear.", "You may feel pressured to produce a five-year answer from a present-day uncertainty.", "Trying many plans, comparing paths, or feeling guilty for changing your mind.", "Demanding certainty too early can make curiosity look like indecision.", "I can choose a direction for now without promising it forever.", "What path would you explore if you did not need it to be permanent?", ["Not Knowing What You Want","Feeling Behind","Uncertainty"]]
  ]}
];

function flatLibraryItems() {
  return REFLECTION_LIBRARY.flatMap((group) => group.items.map((item) => ({
    id: item[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    group: group.title, title: item[0], summary: item[1], feel: item[2], look: item[3], loop: item[4], reframe: item[5], prompt: item[6], related: item[7]
  })));
}
const LIBRARY_ITEMS = flatLibraryItems();
function libraryItem(id) { return LIBRARY_ITEMS.find((item) => item.id === id); }
function renderReflectionLibrary() {
  const host = $("reflection-library-groups");
  if (!host) return;
  host.replaceChildren(...REFLECTION_LIBRARY.map((group, groupIndex) => {
    const details = document.createElement("details"); details.className = "library-group"; details.open = groupIndex < 2;
    const summary = document.createElement("summary"); summary.innerHTML = `<span>${group.title}</span><small>${group.items.length} reflections</small>`;
    const grid = document.createElement("div"); grid.className = "library-item-grid";
    group.items.forEach((item) => {
      const data = LIBRARY_ITEMS.find((x) => x.title === item[0]);
      const button = document.createElement("button"); button.type = "button"; button.className = "library-item"; button.dataset.libraryId = data.id;
      button.innerHTML = `<span>${data.title}</span><small>${data.summary}</small><b>Open →</b>`;
      grid.appendChild(button);
    });
    details.append(summary, grid); return details;
  }));
}

function openLibraryCard(id) {
  const item = libraryItem(id); if (!item) return;
  selectedLibraryId = id;
  $("library-card-kicker").textContent = item.group.toUpperCase();
  $("library-card-title").textContent = item.title;
  $("library-card-summary").textContent = item.summary;
  $("library-card-feel").textContent = item.feel;
  $("library-card-look").textContent = item.look;
  $("library-card-loop").textContent = item.loop;
  $("library-card-reframe").textContent = item.reframe;
  $("library-card-prompt").textContent = item.prompt;
  const related = $("library-card-related");
  related.replaceChildren(...item.related.map((title) => {
    const relatedItem = LIBRARY_ITEMS.find((x) => x.title === title);
    const b = document.createElement("button"); b.type = "button"; b.className = "related-btn"; b.textContent = title; b.dataset.libraryId = relatedItem?.id || ""; return b;
  }).filter((b) => b.dataset.libraryId));
  setModal("reflection-library-modal", true);
}

function writeLibraryPrompt() {
  const item = libraryItem(selectedLibraryId); if (!item) return;
  setModal("reflection-library-modal", false);
  resetWriter();
  entryText.value = `${item.prompt}\n\n`;
  setTab("write"); entryText.focus(); populateWriteStats();
}

function selectedIdeaDepth() { return document.querySelector('input[name="idea-depth"]:checked')?.value || "tiny"; }
function curatedIdea(mode, depth = selectedIdeaDepth()) { const list = IDEA_PROMPTS[mode]?.[depth] || IDEA_PROMPTS[mode]?.tiny || []; return list[Math.floor(Math.random() * list.length)] || "Start with one honest sentence."; }
function selectIdeaMode(mode) { selectedIdeaMode = mode; const input = document.querySelector(`input[name="idea-mode"][value="${mode}"]`); if (input) input.checked = true; }
function showIdeaPrompt(prompt, mode = selectedIdeaMode) { selectedIdeaMode = mode; ideaText.textContent = prompt; btnUseIdea.hidden = false; ideaResult.hidden = false; ideaResult.classList.remove("idea-reveal"); void ideaResult.offsetWidth; ideaResult.classList.add("idea-reveal"); }
function setMission() { const [title, text] = MISSIONS[Math.floor(Math.random() * MISSIONS.length)]; $("mission-title").textContent = title; $("mission-text").textContent = text; }
function setMarginNote() { $("margin-note").textContent = MARGIN_NOTES[Math.floor(Math.random() * MARGIN_NOTES.length)]; }
function setTab(tab) { ({ write: tabWrite, ideas: tabIdeas, history: tabHistory, explore: tabExplore }[tab] || tabWrite).checked = true; window.scrollTo({ top: 0, behavior: "smooth" }); }
function showToast(message) { const toast = $("toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200); }
function setModal(id, open) { const el = $(id); if (!el) return; el.classList.toggle("open", open); if (open) { document.body.classList.add("modal-open"); const focusable = el.querySelector("button, input, select"); setTimeout(() => focusable?.focus(), 30); } else if (![...document.querySelectorAll(".modal.open")].length) document.body.classList.remove("modal-open"); }

function renderHistory() {
  const entries = loadEntries().map(normalizeEntry);
  const query = $("history-search").value.trim().toLowerCase();
  const filter = $("history-filter").value;
  const mood = $("history-mood").value;
  const now = new Date();
  const startWeek = new Date(now); startWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7)); startWeek.setHours(0, 0, 0, 0);
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const shown = entries.filter((entry) => {
    const d = escapeDate(entry.createdAt), haystack = `${entry.text} ${entry.tags.join(" ")} ${entry.mood}`.toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (mood !== "all" && entry.mood !== mood) return false;
    if (filter === "favorites" && !entry.favorite) return false;
    if (filter === "today" && dateKey(d) !== dateKey(now)) return false;
    if (filter === "week" && d < startWeek) return false;
    if (filter === "month" && d < startMonth) return false;
    return true;
  });
  historyList.replaceChildren();
  shown.forEach((entry) => historyList.appendChild(entryCard(entry)));
  historyEmpty.hidden = entries.length > 0;
  historyNoResults.hidden = !(entries.length && shown.length === 0);
  $("history-summary").textContent = `${shown.length} ${shown.length === 1 ? "entry" : "entries"}`;
}
function entryCard(entry) {
  const li = document.createElement("li"); li.className = "entry"; li.tabIndex = 0;
  const header = document.createElement("div"); header.className = "entry-head";
  const time = document.createElement("time"); const f = formatDate(entry.createdAt); time.dateTime = f.iso; time.textContent = f.label.toUpperCase(); header.appendChild(time);
  const badges = document.createElement("div"); badges.className = "entry-badges";
  if (entry.mood) { const m = document.createElement("span"); m.className = `mood-chip mood-${entry.mood}`; m.textContent = moodLabel(entry.mood); badges.appendChild(m); }
  if (entry.favorite) { const fav = document.createElement("span"); fav.className = "fav-mark"; fav.textContent = "♥"; fav.setAttribute("aria-label", "Favorite"); badges.appendChild(fav); }
  header.appendChild(badges); li.appendChild(header);
  const preview = document.createElement("p"); preview.className = "preview"; preview.textContent = entry.text || "(Empty entry)"; li.appendChild(preview);
  const footer = document.createElement("div"); footer.className = "entry-foot";
  const meta = document.createElement("span"); meta.textContent = `${words(entry.text)} words · ${readTime(entry.text)} min read`; footer.appendChild(meta);
  if (entry.tags.length) { const tags = document.createElement("span"); tags.className = "entry-tags"; tags.textContent = entry.tags.slice(0, 3).map((x) => `#${x}`).join(" "); footer.appendChild(tags); }
  li.appendChild(footer);
  const open = () => openEntryDetail(entry.id); li.addEventListener("click", open); li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  return li;
}

function populateWriteStats() {
  const entries = loadEntries().map(normalizeEntry), today = dateKey(new Date());
  $("today-count").textContent = entries.filter((e) => dateKey(e.createdAt) === today).length;
  $("writing-meta").textContent = `${words(entryText.value)} words · ${readTime(entryText.value)} min`;
  $("today-label").textContent = formatLongDate(new Date()).replace(/,\s*\d{4}$/, "").toUpperCase();
  const last = entries[0]; const card = $("continue-card");
  if (last && !editingId) { card.hidden = false; card.replaceChildren(); const text = document.createElement("p"); text.className = "eyebrow"; text.textContent = "LAST PAGE"; const title = document.createElement("h3"); title.textContent = `${formatDate(last.createdAt, { weekday: undefined, year: undefined }).label}`; const preview = document.createElement("p"); preview.textContent = last.text.slice(0, 150) + (last.text.length > 150 ? "…" : ""); const button = document.createElement("button"); button.className = "text-btn"; button.type = "button"; button.textContent = "Continue writing →"; button.addEventListener("click", () => beginEdit(last.id)); card.append(text, title, preview, button); }
  else card.hidden = true;
}
function resetWriter() { editingId = null; followupContextId = null; currentQuestions = []; $("reflection-summary").hidden = true; $("reflection-summary-text").textContent = ""; $("reflection-heard").textContent = ""; $("reflection-next").textContent = ""; $("followup-context").hidden = true; $("followup-source").textContent = ""; entryText.value = ""; $("entry-tags").value = ""; $("edit-state").hidden = true; btnSave.textContent = "Save entry"; questionsResult.hidden = true; questionsList.replaceChildren(); document.querySelectorAll('input[name="entry-mood"]').forEach((x) => x.checked = false); populateWriteStats(); }
function continueThought(id) {
  const entry = loadEntries().map(normalizeEntry).find((e) => e.id === id); if (!entry) return;
  resetWriter(); followupContextId = id;
  const excerpt = entry.text.trim().slice(0, 420);
  $("followup-source").textContent = `“${excerpt}${entry.text.trim().length > 420 ? "…”" : "”"}`;
  $("followup-context").hidden = false;
  setTab("write"); entryText.focus();
}

function beginEdit(id) { const entry = loadEntries().map(normalizeEntry).find((e) => e.id === id); if (!entry) return; editingId = entry.id; entryText.value = entry.text; $("entry-tags").value = entry.tags.map((x) => `#${x}`).join(" "); document.querySelectorAll('input[name="entry-mood"]').forEach((x) => x.checked = x.value === entry.mood); currentQuestions = [...entry.questions]; $("edit-state").hidden = false; btnSave.textContent = "Update entry"; setTab("write"); entryText.focus(); populateWriteStats(); }
function persistEntry() {
  const text = entryText.value.trim(); if (!text) return alert("Please write something before saving.");
  const entries = loadEntries().map(normalizeEntry), tags = parseTags($("entry-tags").value), mood = document.querySelector('input[name="entry-mood"]:checked')?.value || "";
  if (editingId) { const i = entries.findIndex((e) => e.id === editingId); if (i >= 0) entries[i] = { ...entries[i], text, tags, mood, questions: currentQuestions, updatedAt: new Date().toISOString() }; }
  else entries.unshift({ id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Date.now()), createdAt: new Date().toISOString(), text, questions: currentQuestions, tags, mood, favorite: false });
  if (!saveEntries(entries)) return;
  const wasEditing = Boolean(editingId); resetWriter(); renderHistory(); renderInsights(); showToast(wasEditing ? "Entry updated" : "Entry saved");
}

async function setupAI() {
  btnQuestions.disabled = true; btnIdea.disabled = false; $("btn-read-pages").disabled = true; $("btn-notice-patterns").disabled = true; $("btn-carrying").disabled = true; modelStatus.dataset.state = "loading"; $("model-state-pill").textContent = "Connecting"; modelText.textContent = "Connecting to local Ollama…"; modelProgress.value = 5; btnConnect.disabled = true; modelSelect.disabled = true;
  try { const result = await initAI((percent, msg) => { modelProgress.value = percent; modelText.textContent = msg; }); modelStatus.dataset.state = "ready"; $("model-state-pill").textContent = "Ready"; modelText.textContent = `Local AI connected (${result.modelName})`; modelSelect.replaceChildren(...result.models.map((name) => new Option(name, name))); modelSelect.value = result.modelName; modelSelect.disabled = false; btnQuestions.disabled = false; btnIdea.disabled = false; $("settings-ai-status").textContent = `Connected · ${result.modelName}`; updateCrossEntryButtons(); }
  catch (err) { console.error("AI setup error:", err); modelStatus.dataset.state = "error"; $("model-state-pill").textContent = "Unavailable"; modelText.textContent = `${err.message} You can still write and save your entries.`; $("settings-ai-status").textContent = "Unavailable · writing remains local"; updateCrossEntryButtons(); }
  finally { btnConnect.disabled = false; }
}

async function generateQuestions() { const text = entryText.value.trim(); if (!text) { questionsList.innerHTML = "<li>Write a few thoughts first, then ask for reflection.</li>"; questionsResult.hidden = false; return; } if (hasCrisisKeywords(text)) { questionsList.replaceChildren(Object.assign(document.createElement("li"), { textContent: "It sounds like you are carrying something heavy. Please reach out to someone you trust or a free helpline (988 in US/CA or 188 in Brazil). You are not alone." })); questionsResult.hidden = false; return; }
  try {
    btnQuestions.disabled = true; btnQuestions.textContent = "Reflecting…";
    const questions = await generateReflectionQuestions(text); currentQuestions = questions;
    const heard = text.replace(/\s+/g, " ").trim(); $("reflection-heard").textContent = heard.length > 260 ? `${heard.slice(0, 257)}…` : heard;
    $("reflection-next").textContent = questions[0] || "What feels most important to stay with?";
    questionsList.replaceChildren(...questions.map((q) => Object.assign(document.createElement("li"), { textContent: q })));
    questionsResult.hidden = false;
  }
  catch (err) { questionsList.replaceChildren(Object.assign(document.createElement("li"), { textContent: err.message })); questionsResult.hidden = false; }
  finally { btnQuestions.disabled = false; btnQuestions.textContent = "✦ Reflect on this"; }
}

btnQuestions.addEventListener("click", generateQuestions); $("btn-reask").addEventListener("click", generateQuestions); $("btn-pattern").addEventListener("click", async () => { const text = entryText.value.trim(); if (!text) return; if (hasCrisisKeywords(text)) return showToast("Let's keep this page human and local for now."); const box = $("reflection-summary"), target = $("reflection-summary-text"); box.hidden = false; target.textContent = "Noticing a possible thread…"; try { target.textContent = await generateReflectionSummary(text); } catch (err) { target.textContent = err.message; } }); $("followup-close").addEventListener("click", () => { followupContextId = null; $("followup-context").hidden = true; }); entryText.addEventListener("input", populateWriteStats); btnSave.addEventListener("click", persistEntry);
btnConnect.addEventListener("click", setupAI); modelSelect.addEventListener("change", () => { selectModel(modelSelect.value); modelText.textContent = `Local AI connected (${modelSelect.value})`; $("settings-ai-status").textContent = `Connected · ${modelSelect.value}`; });

btnIdea.addEventListener("click", async () => {
  const checked = document.querySelector('input[name="idea-mode"]:checked');
  if (!checked) { ideaText.textContent = "Choose a writing door first. There is no wrong one."; btnUseIdea.hidden = true; ideaResult.hidden = false; return; }
  selectIdeaMode(checked.value);
  try {
    btnIdea.disabled = true; btnIdea.textContent = "Finding a page…";
    if (["anxious", "grateful", "reflective", "bored"].includes(checked.value)) {
      ideaText.textContent = await generateIdeaForMood(checked.value);
      showIdeaPrompt(ideaText.textContent, checked.value);
    } else {
      showIdeaPrompt(curatedIdea(checked.value), checked.value);
    }
  } catch (err) { ideaText.textContent = err.message; btnUseIdea.hidden = true; ideaResult.hidden = false; }
  finally { btnIdea.disabled = false; btnIdea.textContent = "Leave me a prompt"; }
});
btnSurprise.addEventListener("click", async () => {
  const modes = ["anxious", "grateful", "reflective", "bored", "curious", "letter", "heavy", "imagine", "future"];
  const mode = modes[Math.floor(Math.random() * modes.length)]; selectIdeaMode(mode); btnSurprise.disabled = true; btnSurprise.textContent = "Opening a door…";
  try {
    if (["anxious", "grateful", "reflective", "bored"].includes(mode)) showIdeaPrompt(await generateIdeaForMood(mode), mode);
    else showIdeaPrompt(curatedIdea(mode), mode);
  } catch (err) { showIdeaPrompt(err.message, mode); btnUseIdea.hidden = true; }
  finally { btnSurprise.disabled = false; btnSurprise.textContent = "✦ Surprise me"; }
});
document.querySelectorAll('input[name="idea-mode"]').forEach((input) => input.addEventListener("change", () => { selectedIdeaMode = input.value; }));
document.querySelectorAll(".fragment-btn").forEach((button) => button.addEventListener("click", () => { selectIdeaMode("fragment"); showIdeaPrompt(button.textContent, "fragment"); }));
$("btn-mission").addEventListener("click", () => { setMission(); showIdeaPrompt($("mission-text").textContent, "mission"); });
btnUseIdea.addEventListener("click", () => {
  entryText.value = `${ideaText.textContent.trim()}\n\n`;
  const ideaMoodMap = { anxious: "anxious", grateful: "grateful", reflective: "reflective", bored: "bored" };
  const ideaMood = ideaMoodMap[selectedIdeaMode];
  if (ideaMood) document.querySelector(`input[name="entry-mood"][value="${ideaMood}"]`).checked = true;
  currentQuestions = []; questionsList.replaceChildren(); questionsResult.hidden = true; setTab("write"); entryText.focus(); populateWriteStats();
});
setMission(); setMarginNote();
$("btn-new-entry").addEventListener("click", () => { resetWriter(); setTab("write"); entryText.focus(); }); $("empty-start").addEventListener("click", () => { resetWriter(); setTab("write"); entryText.focus(); });


function shortEntryTitle(entry) {
  const f = formatDate(entry.createdAt, { weekday: undefined, year: undefined });
  return f.label;
}
function renderSourceButtons(host, entries) {
  host.replaceChildren(...entries.map((entry) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "source-page";
    const label = document.createElement("span"); label.textContent = shortEntryTitle(entry);
    const preview = document.createElement("small"); preview.textContent = entry.text.replace(/\s+/g, " ").trim().slice(0, 90) + (entry.text.length > 90 ? "…" : "");
    button.append(label, preview); button.addEventListener("click", () => openEntryDetail(entry.id)); return button;
  }));
}
function parseTaggedSections(output) {
  const clean = String(output || "").replace(/```(?:text)?/gi, "").trim();
  const get = (label, nextLabels) => {
    const end = nextLabels.length ? `(?=^\\s*(?:${nextLabels.join("|")}):)` : "$";
    const re = new RegExp(`^\\s*${label}:\\s*(.*?)${end}`, "ims");
    return (clean.match(re)?.[1] || "").trim();
  };
  return { thread: get("THREAD", ["NOTICE", "QUESTION"]), notice: get("NOTICE", ["QUESTION"]), question: get("QUESTION", []) };
}
function parseObservationLines(output, entries) {
  const clean = String(output || "").replace(/```(?:text)?/gi, "").trim();
  const matches = [...clean.matchAll(/^\s*\[([0-9\s,]+)\]\s*(.+)$/gm)];
  return matches.map((match) => {
    const indexes = [...new Set(match[1].split(",").map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x >= 1 && x <= entries.length))];
    return indexes.length ? { text: match[2].trim(), entries: indexes.map((n) => entries[n - 1]) } : null;
  }).filter((item) => item && item.text).slice(0, 3);
}
function parseCarrying(output, entries) {
  const clean = String(output || "").replace(/```(?:text)?/gi, "").trim();
  const carrying = clean.match(/^\s*CARRYING:\s*(.*?)(?=^\s*SOURCES:)/ims)?.[1]?.trim() || "";
  const sourceText = clean.match(/^\s*SOURCES:\s*(.*?)(?=^\s*QUESTION:)/ims)?.[1] || "";
  const question = clean.match(/^\s*QUESTION:\s*(.*)$/ims)?.[1]?.trim() || "";
  const indexes = [...new Set(sourceText.split(/[,\s]+/).map((x) => Number(x)).filter((x) => Number.isInteger(x) && x >= 1 && x <= entries.length))];
  return { carrying, question, entries: indexes.map((n) => entries[n - 1]) };
}
function getCrossEntryPool(limit = 12) {
  return loadEntries().map(normalizeEntry).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);
}
function updateCrossEntryButtons() {
  const aiReady = modelStatus.dataset.state === "ready";
  const entries = getCrossEntryPool();
  const readBtn = $("btn-read-pages"); if (readBtn) readBtn.disabled = !aiReady || selectedPageIds.size < 2 || selectedPageIds.size > 8 || entries.length < 2;
  const observeBtn = $("btn-notice-patterns"); if (observeBtn) observeBtn.disabled = !aiReady || entries.length < 3;
  const carryingBtn = $("btn-carrying"); if (carryingBtn) carryingBtn.disabled = !aiReady || entries.length < 3;
  const count = $("read-pages-count"); if (count) count.textContent = `${selectedPageIds.size} selected`;
}
function renderPageChooser() {
  const host = $("read-pages-list"); if (!host) return;
  const entries = getCrossEntryPool(); host.replaceChildren();
  if (!entries.length) {
    host.appendChild(Object.assign(document.createElement("p"), { className: "empty-inline", textContent: "Your first few pages will make this space come alive." }));
    updateCrossEntryButtons(); return;
  }
  entries.forEach((entry, index) => {
    const label = document.createElement("label"); label.className = "read-page-option";
    const input = document.createElement("input"); input.type = "checkbox"; input.value = entry.id; input.checked = selectedPageIds.has(entry.id); input.setAttribute("aria-label", `Select page from ${shortEntryTitle(entry)}`);
    input.addEventListener("change", () => {
      if (input.checked && selectedPageIds.size >= 8) { input.checked = false; showToast("Choose up to 8 pages."); return; }
      if (input.checked) selectedPageIds.add(entry.id); else selectedPageIds.delete(entry.id); updateCrossEntryButtons();
    });
    const sheet = document.createElement("span"); sheet.className = "read-page-sheet";
    const top = document.createElement("strong"); top.textContent = shortEntryTitle(entry); const preview = document.createElement("small"); preview.textContent = entry.text.replace(/\s+/g, " ").trim().slice(0, 100) + (entry.text.length > 100 ? "…" : ""); sheet.append(top, preview);
    label.append(input, sheet); host.appendChild(label);
  });
  if (entries.length < 2) host.appendChild(Object.assign(document.createElement("p"), { className: "empty-inline", textContent: "Choose at least two pages once you have more to read together." }));
  updateCrossEntryButtons();
}
async function readSelectedPages() {
  const entries = getCrossEntryPool().filter((e) => selectedPageIds.has(e.id));
  if (entries.length < 2) return;
  if (entries.some((e) => hasCrisisKeywords(e.text))) { showToast("I won't synthesize a page with crisis-language automatically."); return; }
  const button = $("btn-read-pages"); button.disabled = true; button.textContent = "Reading…";
  const result = $("read-pages-result"); result.hidden = false;
  $("read-thread").textContent = "Reading the thread…"; $("read-notice").textContent = ""; $("read-question").textContent = ""; $("read-sources").replaceChildren();
  try {
    const parsed = parseTaggedSections(await generateSelectedPagesReflection(entries));
    $("read-thread").textContent = parsed.thread || "I couldn't find a grounded thread this time. Try a slightly different set of pages.";
    $("read-notice").textContent = parsed.notice || "";
    $("read-question").textContent = parsed.question || "";
    renderSourceButtons($("read-sources"), entries);
  } catch (err) {
    $("read-thread").textContent = err.message;
    $("read-notice").textContent = ""; $("read-question").textContent = "";
  } finally { button.textContent = "Find the thread"; updateCrossEntryButtons(); }
}
async function findNoticedPatterns() {
  const entries = getCrossEntryPool(); if (entries.length < 3) return;
  if (entries.some((e) => hasCrisisKeywords(e.text))) { showToast("Some pages are better kept for your own reflection right now."); return; }
  const button = $("btn-notice-patterns"), host = $("noticed-patterns"); button.disabled = true; button.textContent = "Looking…"; host.hidden = false; host.replaceChildren(Object.assign(document.createElement("p"), { className: "empty-inline", textContent: "Looking for grounded threads…" }));
  try {
    const observations = parseObservationLines(await generateJournalObservations(entries), entries);
    host.replaceChildren(...(observations.length ? observations : [{ text: "I couldn't find a strong enough pattern to name yet. Keep writing.", entries: [] }]).map((item) => {
      const box = document.createElement("article"); box.className = "observation-item"; const p = document.createElement("p"); p.textContent = item.text; box.appendChild(p);
      if (item.entries.length) { const source = document.createElement("div"); source.className = "observation-sources"; renderSourceButtons(source, item.entries); box.appendChild(source); }
      return box;
    }));
  } catch (err) { host.replaceChildren(Object.assign(document.createElement("p"), { className: "empty-inline", textContent: err.message })); }
  finally { button.textContent = "Look across my pages"; updateCrossEntryButtons(); }
}
async function findCarryingThread() {
  const entries = getCrossEntryPool(); if (entries.length < 3) return;
  if (entries.some((e) => hasCrisisKeywords(e.text))) { showToast("Some pages are better kept for your own reflection right now."); return; }
  const button = $("btn-carrying"), result = $("carrying-result"); button.disabled = true; button.textContent = "Reading…"; result.hidden = false; $("carrying-copy").textContent = "Looking across your pages…"; $("carrying-question").textContent = ""; $("carrying-sources").replaceChildren();
  try {
    const parsed = parseCarrying(await generateCarryingReflection(entries), entries);
    $("carrying-copy").textContent = parsed.carrying || "I couldn't find one grounded thread to name yet.";
    $("carrying-question").textContent = parsed.question || "What feels worth staying with for another page?";
    renderSourceButtons($("carrying-sources"), parsed.entries);
  } catch (err) { $("carrying-copy").textContent = err.message; }
  finally { button.textContent = "Find the thread I'm carrying"; updateCrossEntryButtons(); }
}

function openEntryDetail(id) { const entry = loadEntries().map(normalizeEntry).find((e) => e.id === id); if (!entry) return; selectedDetailId = id; $("detail-date").textContent = formatLongDate(entry.createdAt).toUpperCase(); const mood = $("detail-mood"); mood.hidden = !entry.mood; mood.textContent = moodLabel(entry.mood); mood.className = `mood-chip mood-${entry.mood}`; const fav = $("detail-favorite"); fav.textContent = entry.favorite ? "♥" : "♡"; fav.classList.toggle("active", entry.favorite); $("detail-text").textContent = entry.text; $("detail-meta").textContent = `${words(entry.text)} words · ${readTime(entry.text)} min read${entry.updatedAt ? " · edited" : ""}`; const tags = $("detail-tags"); tags.replaceChildren(...entry.tags.map((tag) => Object.assign(document.createElement("span"), { className: "tag", textContent: `#${tag}` })));
  const reflections = $("detail-questions"); const ol = reflections.querySelector("ol"); ol.replaceChildren(...entry.questions.map((q) => Object.assign(document.createElement("li"), { textContent: q }))); reflections.hidden = entry.questions.length === 0; setModal("entry-detail", true); }
$("detail-close").addEventListener("click", () => setModal("entry-detail", false)); $("detail-continue").addEventListener("click", () => { setModal("entry-detail", false); continueThought(selectedDetailId); }); $("library-card-close").addEventListener("click", () => setModal("reflection-library-modal", false)); $("btn-library-write").addEventListener("click", writeLibraryPrompt); document.addEventListener("click", (e) => { const button = e.target.closest("[data-library-id]"); if (button?.dataset.libraryId) openLibraryCard(button.dataset.libraryId); }); $("btn-read-pages").addEventListener("click", readSelectedPages); $("btn-notice-patterns").addEventListener("click", findNoticedPatterns); $("btn-carrying").addEventListener("click", findCarryingThread); $("detail-edit").addEventListener("click", () => { setModal("entry-detail", false); beginEdit(selectedDetailId); }); $("detail-favorite").addEventListener("click", () => { const entries = loadEntries().map(normalizeEntry); const i = entries.findIndex((e) => e.id === selectedDetailId); if (i < 0) return; entries[i].favorite = !entries[i].favorite; saveEntries(entries); openEntryDetail(selectedDetailId); renderHistory(); renderInsights(); }); $("detail-delete").addEventListener("click", () => { const entries = loadEntries().filter((e) => e.id !== selectedDetailId); saveEntries(entries); setModal("entry-detail", false); renderHistory(); renderInsights(); showToast("Entry deleted"); }); $("detail-print").addEventListener("click", () => printEntry(selectedDetailId));
function printEntry(id) { const entry = loadEntries().map(normalizeEntry).find((e) => e.id === id); if (!entry) return; const w = window.open("", "_blank", "noopener,noreferrer,width=720,height=900"); if (!w) return; const safeText = entry.text.replace(/[&<>]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); w.document.write(`<title>My Journal Book — ${formatLongDate(entry.createdAt)}</title><style>body{max-width:680px;margin:60px auto;padding:0 28px;color:#302b26;font:18px/1.8 Georgia,serif}h1{font:600 28px Georgia,serif}p.meta{font:600 12px system-ui;text-transform:uppercase;letter-spacing:.14em;color:#82766b}article{white-space:pre-wrap;margin-top:36px}@media print{body{margin:18mm auto}}</style><p class="meta">My Journal Book</p><h1>${formatLongDate(entry.createdAt)}</h1><article>${safeText}</article>`); w.document.close(); w.focus(); w.print(); }

function filteredEntriesForCalendar() { const entries = loadEntries().map(normalizeEntry), y = calendarCursor.getFullYear(), m = calendarCursor.getMonth(); return entries.filter((e) => { const d = escapeDate(e.createdAt); return d.getFullYear() === y && d.getMonth() === m; }); }
function renderCalendar() { const grid = $("calendar-grid"), year = calendarCursor.getFullYear(), month = calendarCursor.getMonth(); $("calendar-title").textContent = calendarCursor.toLocaleDateString("en-US", { month: "long", year: "numeric" }); grid.replaceChildren(); ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach((day) => grid.appendChild(Object.assign(document.createElement("div"), { className: "calendar-weekday", textContent: day }))); const first = new Date(year, month, 1), offset = (first.getDay() + 6) % 7, days = new Date(year, month + 1, 0).getDate(), counts = {}; filteredEntriesForCalendar().forEach((e) => counts[dateKey(e.createdAt)] = (counts[dateKey(e.createdAt)] || 0) + 1); for (let i = 0; i < offset; i++) grid.appendChild(Object.assign(document.createElement("div"), { className: "calendar-cell empty-cell" })); for (let day = 1; day <= days; day++) { const key = dateKey(new Date(year, month, day)); const button = document.createElement("button"); button.type = "button"; button.className = `calendar-cell${selectedCalendarDate === key ? " selected" : ""}`; button.textContent = day; if (counts[key]) { const dot = document.createElement("span"); dot.className = "calendar-dot"; dot.textContent = counts[key] > 1 ? counts[key] : ""; button.appendChild(dot); } button.addEventListener("click", () => { selectedCalendarDate = key; renderCalendar(); renderCalendarEntries(key); }); grid.appendChild(button); } }
function renderCalendarEntries(key) { const list = $("calendar-entries"), entries = loadEntries().map(normalizeEntry).filter((e) => dateKey(e.createdAt) === key); $("calendar-selected").textContent = new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }); list.replaceChildren(...entries.map(entryCard)); }
$("history-search").addEventListener("input", renderHistory); $("history-filter").addEventListener("change", renderHistory); $("history-mood").addEventListener("change", renderHistory); $("history-view").addEventListener("change", (e) => { const calendar = e.target.value === "calendar"; $("timeline-view").hidden = calendar; $("calendar-view").hidden = !calendar; if (calendar) { renderCalendar(); if (selectedCalendarDate) renderCalendarEntries(selectedCalendarDate); } }); $("calendar-prev").addEventListener("click", () => { calendarCursor.setMonth(calendarCursor.getMonth() - 1); selectedCalendarDate = null; renderCalendar(); $("calendar-entries").replaceChildren(); }); $("calendar-next").addEventListener("click", () => { calendarCursor.setMonth(calendarCursor.getMonth() + 1); selectedCalendarDate = null; renderCalendar(); $("calendar-entries").replaceChildren(); }); $("clear-history-filters").addEventListener("click", () => { $("history-search").value = ""; $("history-filter").value = "all"; $("history-mood").value = "all"; renderHistory(); }); $("view-favorites").addEventListener("click", () => { setTab("history"); $("history-filter").value = "favorites"; renderHistory(); });

function renderInsights() { const entries = loadEntries().map(normalizeEntry), totalWords = entries.reduce((sum, e) => sum + words(e.text), 0), days = new Set(entries.map((e) => dateKey(e.createdAt))).size, favs = entries.filter((e) => e.favorite).length; const writingDays = new Set(entries.map((e) => dateKey(e.createdAt))); let streak = 0; const cursor = new Date(); while (writingDays.has(dateKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); } $("stat-total").textContent = entries.length; $("stat-days").textContent = days; $("stat-words").textContent = totalWords.toLocaleString(); $("stat-favorites").textContent = favs; $("stat-streak").textContent = streak; const moodBars = $("mood-bars"), counts = Object.fromEntries(MOODS.map((m) => [m, 0])); entries.forEach((e) => { if (e.mood) counts[e.mood]++; }); const max = Math.max(1, ...Object.values(counts)); moodBars.replaceChildren(...MOODS.map((m) => { const row = document.createElement("div"); row.className = "mood-bar-row"; const label = document.createElement("span"); label.textContent = moodLabel(m); const track = document.createElement("div"); track.className = "bar-track"; const bar = document.createElement("i"); bar.style.width = `${(counts[m] / max) * 100}%`; track.appendChild(bar); const val = document.createElement("b"); val.textContent = counts[m]; row.append(label, track, val); return row; }));
  const rhythm = $("rhythm-copy"); if (!entries.length) rhythm.innerHTML = "<p>Your pattern will appear here once you have a few pages.</p>"; else { const sorted = [...entries].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)); const weekday = sorted[0] ? escapeDate(sorted[0].createdAt).toLocaleDateString("en-US", { weekday: "long" }) : ""; rhythm.innerHTML = `<p>You have written on <strong>${days}</strong> different ${days === 1 ? "day" : "days"} so far.</p><p>Your most recent page was written on a <strong>${weekday}</strong>.</p>`; }
  const favoriteList = $("favorite-list"); const favorites = entries.filter((e) => e.favorite).slice(0, 3); favoriteList.replaceChildren(...(favorites.length ? favorites : []).map(entryCard)); if (!favorites.length) favoriteList.appendChild(Object.assign(document.createElement("p"), { className: "empty-inline", textContent: "Favorite the entries you want to keep close." })); renderPageChooser();}

// Settings and export/import
function setTheme(value) { document.documentElement.dataset.theme = value; saveSettings({ ...loadSettings(), theme: value }); }
$("btn-settings").addEventListener("click", () => { $("theme-select").value = getSetting("theme", "system"); $("toggle-word-count").checked = getSetting("showWordCount", true); $("toggle-status").checked = getSetting("showStatus", true); $("settings-ai-status").textContent = modelStatus.dataset.state === "ready" ? modelText.textContent : "Not connected"; setModal("settings-modal", true); }); $("settings-close").addEventListener("click", () => setModal("settings-modal", false)); $("theme-select").addEventListener("change", (e) => setTheme(e.target.value)); $("toggle-word-count").addEventListener("change", (e) => { saveSettings({ ...loadSettings(), showWordCount: e.target.checked }); $("writing-meta").hidden = !e.target.checked; }); $("toggle-status").addEventListener("change", (e) => { saveSettings({ ...loadSettings(), showStatus: e.target.checked }); document.querySelectorAll(".status-chip").forEach((x) => x.hidden = !e.target.checked); });
function download(name, content, type) { const blob = new Blob([content], { type }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 500); }
const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMPORT_TEXT_LENGTH = 500_000;
function validateImportedEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const id = typeof entry.id === "string" || typeof entry.id === "number" ? String(entry.id).trim() : "";
  const text = typeof entry.text === "string" ? entry.text : "";
  const timestamp = new Date(entry.createdAt);
  if (!id || !text || text.length > MAX_IMPORT_TEXT_LENGTH || Number.isNaN(timestamp.getTime())) return null;
  if (entry.updatedAt !== undefined && Number.isNaN(new Date(entry.updatedAt).getTime())) return null;
  if (entry.tags !== undefined && (!Array.isArray(entry.tags) || entry.tags.some((tag) => typeof tag !== "string" || tag.length > 50))) return null;
  if (entry.questions !== undefined && (!Array.isArray(entry.questions) || entry.questions.some((question) => typeof question !== "string" || question.length > 1000))) return null;
  if (entry.mood !== undefined && entry.mood !== "" && !MOODS.includes(entry.mood)) return null;
  return normalizeEntry({ ...entry, id, createdAt: timestamp.toISOString(), ...(entry.updatedAt ? { updatedAt: new Date(entry.updatedAt).toISOString() } : {}) });
}
$("btn-export-json").addEventListener("click", () => download("my-journal-book-backup.json", JSON.stringify(loadEntries(), null, 2), "application/json")); $("btn-export-md").addEventListener("click", () => { const md = loadEntries().map(normalizeEntry).map((e) => `# ${formatLongDate(e.createdAt)}\n\n${e.mood ? `**Mood:** ${moodLabel(e.mood)}\n\n` : ""}${e.tags.length ? `**Tags:** ${e.tags.map((x) => `#${x}`).join(" ")}\n\n` : ""}${e.text}\n`).join("\n---\n\n"); download("my-journal-book-journal.md", `# My Journal Book\n\n${md}`, "text/markdown"); }); $("btn-import").addEventListener("click", () => $("import-file").click()); $("import-file").addEventListener("change", async (e) => { const file = e.target.files?.[0]; if (!file) return; try { if (file.size > MAX_IMPORT_FILE_BYTES) throw new Error("Backup file is too large. Please use a backup smaller than 10 MB."); const parsed = JSON.parse(await file.text()); if (!Array.isArray(parsed)) throw new Error("Backup must contain an array of entries."); const valid = parsed.map(validateImportedEntry).filter(Boolean); if (!valid.length && parsed.length) throw new Error("No valid journal entries were found."); if (valid.length !== parsed.length) showToast(`${parsed.length - valid.length} invalid entr${parsed.length - valid.length === 1 ? "y was" : "ies were"} skipped`); const current = loadEntries().map(normalizeEntry); const byId = new Map(current.map((x) => [x.id, x])); valid.forEach((x) => byId.set(x.id, x)); if (!saveEntries([...byId.values()].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)))) throw new Error("The restored journal could not be saved."); renderHistory(); renderInsights(); showToast(`${valid.length} entries restored`); } catch (err) { alert(`Import failed: ${err.message}`); } finally { e.target.value = ""; } });
function openDelete() { setModal("settings-modal", false); setModal("confirm-delete", true); } $("btn-delete-from-settings").addEventListener("click", openDelete); $("panel-history").querySelector(".text-danger").addEventListener("click", (e) => { e.preventDefault(); openDelete(); }); $("btn-delete-cancel").addEventListener("click", () => setModal("confirm-delete", false)); $("btn-delete-confirm").addEventListener("click", () => { localStorage.removeItem(STORAGE_KEY); resetWriter(); renderHistory(); renderInsights(); setModal("confirm-delete", false); showToast("Journal cleared"); });

// Online/offline state
function updateOnlineState() { const online = navigator.onLine; $("offline-label").textContent = online ? "Ready offline" : "Offline"; $("offline-badge").classList.toggle("offline", !online); } window.addEventListener("online", updateOnlineState); window.addEventListener("offline", updateOnlineState);
const initialSettings = loadSettings(); setTheme(initialSettings.theme || "system"); $("writing-meta").hidden = initialSettings.showWordCount === false; if (initialSettings.showStatus === false) document.querySelectorAll(".status-chip").forEach((x) => x.hidden = true); updateOnlineState();

// Command palette + shortcuts
function openPalette() { setModal("command-palette", true); } function closePalette() { setModal("command-palette", false); } $("btn-settings").addEventListener("contextmenu", (e) => { e.preventDefault(); openPalette(); }); $("palette-close").addEventListener("click", closePalette); document.querySelectorAll(".palette-action").forEach((button) => button.addEventListener("click", () => { const c = button.dataset.command; closePalette(); if (c === "write") { resetWriter(); setTab("write"); entryText.focus(); } else if (c === "search") { setTab("history"); setTimeout(() => $("history-search").focus(), 80); } else if (c === "history") setTab("history"); else if (c === "explore") setTab("explore"); else if (c === "settings") $("btn-settings").click(); })); document.addEventListener("keydown", (e) => { const mod = e.ctrlKey || e.metaKey; if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); } if (mod && e.key === "Enter" && !entryText.matches(":focus")) return; if (mod && e.key === "Enter" && tabWrite.checked) { e.preventDefault(); persistEntry(); } if (e.key === "Escape") { document.querySelectorAll(".modal.open").forEach((m) => setModal(m.id, false)); } if (!mod && e.key.toLowerCase() === "n" && !/input|textarea|select/i.test(document.activeElement.tagName || "")) { resetWriter(); setTab("write"); entryText.focus(); } });

renderReflectionLibrary(); renderHistory(); renderInsights(); populateWriteStats(); renderCalendar(); setTimeout(() => setupAI(), 0);
if ("serviceWorker" in navigator) { const hadController = Boolean(navigator.serviceWorker.controller); let refreshing = false; navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController && !refreshing) { refreshing = true; window.location.reload(); } }); window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js?v=journal-book-sw-2", { updateViaCache: "none" }).catch((err) => console.warn("ServiceWorker registration failed:", err))); }
