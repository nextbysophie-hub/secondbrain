/** Builds a .shortcut file (an XML property list) that mirrors the Shortcut
 *  structure we already know works on a real iPhone: a Share Sheet branch that
 *  also sends the shared link, and a plain branch for Siri / home-screen runs. */

type Plist = string | number | boolean | Plist[] | { [k: string]: Plist };

const OBJ = "\uFFFC"; // the placeholder character a variable chip occupies

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function plistNode(v: Plist): string {
  if (typeof v === "string") return `<string>${esc(v)}</string>`;
  if (typeof v === "boolean") return v ? "<true/>" : "<false/>";
  if (typeof v === "number") return `<integer>${v}</integer>`;
  if (Array.isArray(v)) return `<array>${v.map(plistNode).join("")}</array>`;
  return `<dict>${Object.entries(v)
    .map(([k, val]) => `<key>${esc(k)}</key>${plistNode(val)}`)
    .join("")}</dict>`;
}

function plist(root: Plist): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">${plistNode(root)}</plist>`;
}

const text = (s: string): Plist => ({
  WFSerializationType: "WFTextTokenString",
  Value: { string: s },
});

const varText = (name: string): Plist => ({
  WFSerializationType: "WFTextTokenString",
  Value: {
    string: OBJ,
    attachmentsByRange: { "{0, 1}": { Type: "Variable", VariableName: name } },
  },
});

const field = (key: string, value: Plist): Plist => ({
  WFItemType: 0,
  WFKey: text(key),
  WFValue: value,
});

const dictValue = (items: Plist[]): Plist => ({
  WFSerializationType: "WFDictionaryFieldValue",
  Value: { WFDictionaryFieldValueItems: items },
});

const actionOutput = (name: string, uuid: string): Plist => ({
  WFSerializationType: "WFTextTokenAttachment",
  Value: { Type: "ActionOutput", OutputName: name, OutputUUID: uuid },
});

/** An action's output embedded inside a text field rather than passed whole. */
const actionOutputText = (name: string, uuid: string): Plist => ({
  WFSerializationType: "WFTextTokenString",
  Value: {
    string: OBJ,
    attachmentsByRange: {
      "{0, 1}": { Type: "ActionOutput", OutputName: name, OutputUUID: uuid },
    },
  },
});

function post(uuid: string, url: Plist, fields: Plist[]): Plist {
  return {
    WFWorkflowActionIdentifier: "is.workflow.actions.downloadurl",
    WFWorkflowActionParameters: {
      UUID: uuid,
      ShowHeaders: false,
      WFHTTPMethod: "POST",
      WFHTTPBodyType: "JSON",
      WFHTTPHeaders: dictValue([field("Content-Type", text("application/json"))]),
      WFJSONValues: dictValue(fields),
      WFURL: url,
    },
  };
}

/** Prints the server's reply, so a failed capture can't masquerade as a success. */
function showResult(uuid: string, postUuid: string): Plist {
  return {
    WFWorkflowActionIdentifier: "is.workflow.actions.showresult",
    WFWorkflowActionParameters: {
      UUID: uuid,
      Text: actionOutputText("Contents of URL", postUuid),
    },
  };
}

export type ShortcutOptions = {
  /** Where the Shortcut posts, without the key. */
  captureUrl: string;
  /** The person's own capture key, or empty for the paste-it-yourself template. */
  captureKey: string;
  kind: "content" | "task";
};

const PLACEHOLDER = "PASTE_YOUR_CAPTURE_LINK_HERE";

export function buildShortcut({ captureUrl, captureKey, kind }: ShortcutOptions): string {
  const group = "9A8B7C6D-0001-4000-8000-000000000001";
  const askShare = "9A8B7C6D-0002-4000-8000-000000000002";
  const askPlain = "9A8B7C6D-0003-4000-8000-000000000003";
  const urlAction = "9A8B7C6D-0004-4000-8000-000000000004";
  const endIf = "9A8B7C6D-0005-4000-8000-000000000005";
  const askDueShare = "9A8B7C6D-000C-4000-8000-00000000000C";
  const askDuePlain = "9A8B7C6D-000D-4000-8000-00000000000D";
  const label = kind === "task" ? "To-dos" : "Content Ideas";
  const prompt = kind === "task" ? "What do you need to do?" : "What's the idea?";
  const duePrompt = "When's it due? Say tomorrow, Friday, a date — or none";
  const isTask = kind === "task";

  // Spoken answers ('tomorrow', 'friday') are parsed server-side, so the prompt
  // stays a plain text question that works over voice as well as on screen.
  const askDue = (uuid: string): Plist[] =>
    isTask
      ? [
          {
            WFWorkflowActionIdentifier: "is.workflow.actions.ask",
            WFWorkflowActionParameters: { UUID: uuid, WFAskActionPrompt: duePrompt },
          },
          {
            WFWorkflowActionIdentifier: "is.workflow.actions.setvariable",
            WFWorkflowActionParameters: {
              WFVariableName: "DueText",
              WFInput: actionOutput("Ask for Input", uuid),
            },
          },
        ]
      : [];

  // One visible Text action holds the whole capture link; both branches read it
  // from there, so there is exactly one box to paste into and nothing to wire up.
  const linkValue = captureKey ? `${captureUrl}?key=${captureKey}` : PLACEHOLDER;
  const url = varText("CaptureLink");

  const body = (withLink: boolean): Plist[] => [
    field("idea", varText("IdeaText")),
    field("type", text(kind)),
    ...(isTask ? [field("due", varText("DueText"))] : []),
    ...(withLink ? [field("link", varText("LinkURL"))] : []),
  ];

  const actions: Plist[] = [
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.gettext",
      WFWorkflowActionParameters: {
        UUID: "9A8B7C6D-0006-4000-8000-000000000006",
        WFTextActionText: text(linkValue),
      },
    },
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.setvariable",
      WFWorkflowActionParameters: {
        WFVariableName: "CaptureLink",
        WFInput: actionOutput("Text", "9A8B7C6D-0006-4000-8000-000000000006"),
      },
    },
    // If there's input from the Share Sheet, keep its link alongside the idea.
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.conditional",
      WFWorkflowActionParameters: {
        GroupingIdentifier: group,
        WFControlFlowMode: 0,
        WFCondition: 100,
        WFInput: {
          WFSerializationType: "WFTextTokenAttachment",
          Value: { Type: "ExtensionInput" },
        },
      },
    },
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.url",
      WFWorkflowActionParameters: {
        UUID: urlAction,
        WFURLActionURL: {
          WFSerializationType: "WFTextTokenAttachment",
          Value: { Type: "ExtensionInput" },
        },
      },
    },
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.setvariable",
      WFWorkflowActionParameters: {
        WFVariableName: "LinkURL",
        WFInput: actionOutput("URL", urlAction),
      },
    },
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.ask",
      WFWorkflowActionParameters: { UUID: askShare, WFAskActionPrompt: prompt },
    },
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.setvariable",
      WFWorkflowActionParameters: {
        WFVariableName: "IdeaText",
        WFInput: actionOutput("Ask for Input", askShare),
      },
    },
    ...askDue(askDueShare),
    post("9A8B7C6D-0007-4000-8000-000000000007", url, body(true)),
    showResult("9A8B7C6D-000A-4000-8000-00000000000A", "9A8B7C6D-0007-4000-8000-000000000007"),
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.conditional",
      WFWorkflowActionParameters: { GroupingIdentifier: group, WFControlFlowMode: 1 },
    },
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.ask",
      WFWorkflowActionParameters: { UUID: askPlain, WFAskActionPrompt: prompt },
    },
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.setvariable",
      WFWorkflowActionParameters: {
        WFVariableName: "IdeaText",
        WFInput: actionOutput("Ask for Input", askPlain),
      },
    },
    ...askDue(askDuePlain),
    post("9A8B7C6D-0008-4000-8000-000000000008", url, body(false)),
    showResult("9A8B7C6D-000B-4000-8000-00000000000B", "9A8B7C6D-0008-4000-8000-000000000008"),
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.conditional",
      WFWorkflowActionParameters: {
        GroupingIdentifier: group,
        UUID: endIf,
        WFControlFlowMode: 2,
      },
    },
    {
      WFWorkflowActionIdentifier: "is.workflow.actions.notification",
      WFWorkflowActionParameters: {
        UUID: "9A8B7C6D-0009-4000-8000-000000000009",
        WFNotificationActionBody: text(`💡 Sent to ${label}`),
      },
    },
  ];

  return plist({
    WFWorkflowClientVersion: "4711",
    WFWorkflowMinimumClientVersion: 900,
    WFWorkflowMinimumClientVersionString: "900",
    WFWorkflowIcon: {
      WFWorkflowIconStartColor: 4274264319,
      WFWorkflowIconGlyphNumber: 59763,
    },
    WFWorkflowHasOutputFallback: false,
    WFWorkflowHasShortcutInputVariables: true,
    WFQuickActionSurfaces: [],
    WFWorkflowImportQuestions: [],
    WFWorkflowOutputContentItemClasses: [],
    WFWorkflowInputContentItemClasses: [
      "WFArticleContentItem",
      "WFGenericFileContentItem",
      "WFImageContentItem",
      "WFRichTextContentItem",
      "WFSafariWebPageContentItem",
      "WFStringContentItem",
      "WFURLContentItem",
    ],
    WFWorkflowTypes: ["ActionExtension", "WFWorkflowTypeShowInSearch"],
    WFWorkflowActions: actions,
  });
}
