export type Faq = { match: RegExp; answer: string };

/**
 * Offline answers so the helper is still useful when no AI key is configured.
 * Order matters: the first match wins, so specific failures come before general topics.
 */
export const FAQS: Faq[] = [
  {
    match:
      /(ran|runs|worked|works|finished|completed|successful|success|no error|green tick|check ?mark).{0,40}(but|and).{0,40}(nothing|not|no row|no idea|empty)|silent|nothing (in|on) notion|nothing (appears|appeared|showed|shows)|shortcut says (it )?(worked|done)/i,
    answer:
      "A Shortcut that finishes with a tick has not necessarily saved anything — it doesn't show you what the server replied, so an error looks identical to success. First, make the failure visible: scroll to the bottom of the Shortcut, add a Show Result action, and set its value to Contents of URL. Run it again and it will print the real answer on screen. The usual cause is the link never getting in: in the current template the very first action is a Text action holding your whole capture link, and if it still says PASTE_YOUR_CAPTURE_LINK_HERE nothing can save. Paste your link over that one box. If you're on an older copy that instead has a Text action saying PASTE_YOUR_KEY_HERE, install the current one from the wizard — that older design needed the link in both Get Contents of URL actions and people kept fixing only the top one, while Siri uses the one under Otherwise.",
  },
  {
    match: /siri (can'?t|cannot|does ?n'?o?t|won'?t) (find|hear|understand|recognise|recognize)|hey siri|(rename|name) (the |my )?shortcut|wrong name|signed/i,
    answer:
      "Siri triggers a shortcut by its exact name, so the name has to be the phrase and nothing else. The templates already arrive named \"Capture Idea\" and \"Capture To-do\" — if yours shows anything else (an older copy, or you renamed it), long-press it in the Shortcuts app, choose Rename, and make it exactly that, no extra words. Then say \"Hey Siri, capture idea\".",
  },
  {
    match: /qr|scan|camera|which (square|code)|two (qr|codes|squares)/i,
    answer:
      "There are two squares and they do different jobs. The first one opens a page in Safari that shows your capture link with a big \"Copy my capture link\" button — tap that and the link is on your phone. The second one installs the shortcut: scan it, tap the yellow bar at the top of the screen (that bar is the button, and it disappears after a few seconds — just point the camera again), then Add Shortcut. If the Shortcuts app was deleted from the phone, reinstall it free from the App Store first, then scan again.",
  },
  {
    match: /network connection was lost|lost connection|connection (error|failed|lost|problem)|could ?n'?o?t connect|no internet|offline|timed? ?out|nsurlerror/i,
    answer:
      "Open /check on the same iPhone and paste the link out of your Get Contents of URL box — it sends a real idea through it and tells you whether the link is the problem. If the checker says the link works but the Shortcut still fails, it's the phone side: turn off iCloud Private Relay and any VPN or content blocker, or try on cellular, and as a last resort switch to the short form of the link (just https://…/api/capture in the URL box, with the long key pasted into a third JSON text field called key — the checker gives you both halves ready to copy). If the checker says the link is bad, the usual causes are an old link whose server is gone, a missing https://, or a space that got dragged along when it was pasted.",
  },
  {
    match: /isn'?t set ?up|not set ?up|fresh link|ok.{0,3}false|401/i,
    answer:
      "That message means the request reached the server but arrived without a working key. In the current template there is exactly one thing to fix: the Text action at the very top of the Shortcut must hold your whole capture link, the long one ending in ?key=… — select what's in it and paste yours over it. Don't edit the Get Contents of URL boxes; they read the link from that Text action. Copy the link fresh from the wizard if you're unsure it pasted in full.",
  },
  {
    match: /add new field|field type|which type|what type|dictionary|boolean|array/i,
    answer:
      "That menu is just asking what kind of thing you're about to type. You want Text both times. Text means plain words — which is all you're entering. Dictionary is a box that holds more boxes, Array is a numbered list, Boolean is yes/no. None of those apply here. So: Add new field → Text → key 'idea'; Add new field → Text → key 'type'.",
  },
  {
    match: /provided input|variable|blue chip|magic variable/i,
    answer:
      "Don't type 'Provided Input' out by hand — it has to be the actual variable. Tap into the Value box, and just above the keyboard you'll see suggestion chips. Tap the one that says Provided Input (or Shortcut Input). It'll turn into a blue pill inside the box. If you typed the words as plain text, every idea you capture will literally say 'Provided Input'.",
  },
  {
    match: /401|unauthorized|invalid.*(key|token)|key.*(invalid|wrong|not work)/i,
    answer:
      "A 401 means Notion didn't accept the key. Go back to notion.so/my-integrations, open your integration, and copy the Internal Integration Secret again — the whole thing, starting with 'ntn_' or 'secret_'. It's usually a missing character at the start or end.",
  },
  {
    match: /404|can'?t see|not found|object_not_found|no pages|nothing (shows|appears) in the list/i,
    answer:
      "A 404 means Notion can see your key but not your page. Open the Notion page you want to use, click the ••• in the top-right corner, choose Connections (or 'Add connections'), and pick your integration. Then come back and hit Refresh.",
  },
  {
    match: /(did ?n'?o?t|does ?n'?o?t|not) (work|show|appear|save)|nothing happened|no idea appeared|not in notion|missing from notion/i,
    answer:
      "Three things to check, in order: (1) is your capture link pasted into the Shortcut exactly, with nothing extra at the end; (2) did you add the integration under Connections on your Notion page; (3) is the Request Body set to JSON with two Text fields named 'idea' and 'type'. The Test step in this wizard tells you which one is broken — run it and paste me the message.",
  },
  {
    match: /500|server error|something went wrong/i,
    answer:
      "A 500 means the middle piece choked rather than you doing anything wrong. Wait a few seconds and hit it again — if it keeps happening, run the Test step in the wizard, because that reports the real underlying reason in plain English.",
  },
  {
    match: /what is (a )?vercel|why vercel|vercel\?/i,
    answer:
      "Vercel is a free service that runs a tiny piece of code on the internet for you. Your iPhone can't talk to Notion properly on its own, so this little piece of code sits in the middle: your phone tells it your idea, and it puts the idea into Notion in the exact format Notion demands. After setup you never look at it again.",
  },
  {
    match: /what is (an? )?(api|integration|token|key|secret)|why.*(token|key|secret)/i,
    answer:
      "Think of it as a house key for your Notion. You're making a spare key and handing it to this little helper so it's allowed to add ideas to your databases. It can only touch pages you explicitly share with it, and you can take the key back any time at notion.so/my-integrations.",
  },
  {
    match: /what is (a )?(webhook|endpoint|url|link)|capture link/i,
    answer:
      "It's just a web address, like a website link — except instead of showing a page, it accepts your idea and files it in Notion. Your Shortcut sends your idea to that address. Keep it private, since anyone holding it could add rows to your databases.",
  },
  {
    match: /what is (a )?(shortcut|siri shortcut)|shortcuts app/i,
    answer:
      "Shortcuts is an app that comes free on every iPhone — look for the two coloured squares. It lets you build a little button, or a Siri phrase, that runs a few steps for you. Ours runs two: ask you for your idea, then send it off to be filed.",
  },
  {
    match: /privacy|is (it|this) safe|secure|steal|who can see|data/i,
    answer:
      "Your Notion key is encrypted before it's stored, and your ideas travel straight into your own Notion — nothing is kept here. If you'd rather nothing at all touched someone else's server, pick 'Run it on my own Vercel' at the hosting step and the key never leaves your account.",
  },
  {
    match: /free|cost|pay|price|subscription|charge/i,
    answer:
      "All of it is free. Notion's free plan is fine, Shortcuts is built into your iPhone, and Vercel's free tier covers vastly more captures than you'll ever make. There's no card anywhere in this.",
  },
  {
    match: /android|samsung|pixel/i,
    answer:
      "This setup uses iPhone Shortcuts. On Android you can do the same thing with Tasker or an HTTP Request widget pointed at the same capture link — the link accepts a request from anything, it isn't iPhone-specific.",
  },
  {
    match: /share ?sheet|instagram|reel|tiktok|save the link/i,
    answer:
      "Turn on 'Show in Share Sheet' in the shortcut's settings (the info icon). Then in Instagram, tap Share on a reel, scroll the row of apps and tap Capture Idea. To store the reel's URL too, add a third Text field to the JSON body with the key 'link' and set its value to the Shortcut Input variable.",
  },
  {
    match: /explain|like i'?m (5|five)|dummies|simple|what does this do|how does (it|this) work/i,
    answer:
      "The whole thing in one breath: you talk to Siri, Siri hands your words to a tiny program on the internet, and that program writes them into your Notion in the format Notion insists on. That's it. The setup is only three real jobs — give Notion a spare key, let it build your two idea lists, then teach your iPhone the address to send ideas to.",
  },
  {
    match: /start over|reset|delete|undo|redo the setup/i,
    answer:
      "'Start over' at the top right wipes your progress on this page only — your Notion databases and anything already captured stay exactly where they are. You'll just make a fresh capture link.",
  },
];

export function offlineAnswer(question: string): string {
  const hit = FAQS.find((f) => f.match.test(question));
  if (hit) return hit.answer;
  return "I don't have a canned answer for that one yet. The short version of the whole setup: your iPhone sends your idea to a little web address, and that address files it into your Notion. If you're stuck on a step, paste me the exact wording of the error you're seeing and I'll translate it.";
}
