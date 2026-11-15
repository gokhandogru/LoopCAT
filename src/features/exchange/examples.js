const identity = {
  format: "loopcat-pack",
  schemaVersion: 1,
  version: "1.0.0",
  publisher: "LoopCAT",
  license: "CC0-1.0",
  languages: { source: "en", target: "tr" }
};
export const EXAMPLE_TERM_PACK = {
  ...identity,
  id: "org.loopcat.turkish-infrastructure",
  kind: "terminology",
  allowTermCopy: true,
  name: "Turkish infrastructure terminology",
  description:
    "Small, synthetic English–Turkish practice glossary. Treat each translation as a suggestion for this exercise.",
  entries: [
    {
      sourceTerm: "server",
      targetTerm: "sunucu",
      status: "preferred",
      conceptId: "server",
      domain: "IT",
      attribution: "LoopCAT teaching example"
    },
    {
      sourceTerm: "backup",
      targetTerm: "yedek",
      status: "preferred",
      conceptId: "backup",
      domain: "IT",
      attribution: "LoopCAT teaching example"
    },
    {
      sourceTerm: "sign in",
      targetTerm: "oturum aç",
      status: "preferred",
      conceptId: "login",
      domain: "UI",
      attribution: "LoopCAT teaching example"
    }
  ]
};
export const EXAMPLE_QA_PACK = {
  ...identity,
  id: "org.loopcat.turkish-infrastructure-qa",
  kind: "qa",
  name: "Turkish infrastructure QA",
  description:
    "Two client-style checks with valid exceptions and explicitly accepted inflections; findings are advisory.",
  entries: [
    {
      id: "server-term",
      op: "target-missing-if-source",
      source: "server",
      targets: ["sunucu", "sunucunun", "sunucuyu"],
      message: "Check the client's approved Turkish form for server.",
      examples: [
        { source: "Restart the server.", target: "Makineyi yeniden başlatın.", expect: "fail" },
        { source: "Server time", target: "Sunucunun saati", expect: "pass" },
        { source: "Serverless computing", target: "Sunucusuz bilişim", expect: "pass" }
      ]
    },
    {
      id: "test-brand",
      op: "target-contains",
      targets: ["eski marka"],
      message: "Replace the retired example brand name.",
      examples: [
        { source: "Product", target: "Eski marka artık kullanılmıyor.", expect: "fail" },
        { source: "Product", target: "Yeni marka", expect: "pass" }
      ]
    }
  ]
};
