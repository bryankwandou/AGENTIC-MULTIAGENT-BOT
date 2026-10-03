/** Everything the floor says out loud, in the operator's UI language. */

export type FloorLang = "en" | "id";

const ROOM_ID: Record<string, string> = {
  "hall-a": "Koridor",
  "hall-b": "Koridor",
  datacenter: "Pusat data",
  server: "Ruang server",
  vault: "Brankas",
  warehouse: "Gudang",
  security: "Keamanan",
  meeting: "Ruang rapat",
  boardroom: "Ruang direksi",
  office: "Kantor terbuka",
  lead: "Ruang pimpinan",
  lounge: "Ruang diskusi",
  game: "Ruang game",
  lobby: "Resepsionis",
  canteen: "Kantin",
  booths: "Bilik fokus",
  library: "Perpustakaan",
};

export function roomName(room: { id: string; name: string }, lang: FloorLang) {
  return lang === "id" ? (ROOM_ID[room.id] ?? room.name) : room.name;
}

const NPC_ID: Record<string, string> = { sentry: "Satpam", concierge: "Resepsionis" };

export function npcName(id: string, name: string, lang: FloorLang) {
  return lang === "id" ? (NPC_ID[id] ?? name) : name;
}

export type Doing =
  | "think"
  | "coffee"
  | "eat"
  | "pingpong"
  | "arcade"
  | "tv"
  | "warehouse"
  | "security"
  | "booth"
  | "read"
  | "vault"
  | "server"
  | "sofa"
  | "window"
  | "print"
  | "cooler"
  | "visit";

type Strings = {
  tag: { think: string; wait: string; write: string; ok: string; err: string; approval: string };
  signs: { datacenter: string; server: string; vault: string; warehouse: string; security: string };
  chars: string;
  shipped: (note: string) => string;
  stopped: string;
  waiting: (reason: string) => string;
  teammates: (n: number) => string;
  needsApproval: (action: string) => string;
  approved: string;
  rejected: string;
  vaultNote: string;
  engineCoffee: string;
  lunch: string;
  pingpong: (mate: string) => string;
  cameras: string;
  smallTalk: string[];
  log: {
    coffee: (a: string) => string;
    eat: (a: string) => string;
    pingpong: (a: string, b: string) => string;
    arcade: (a: string) => string;
    box: (a: string) => string;
    booth: (a: string) => string;
    read: (a: string) => string;
    vault: (a: string) => string;
    server: (a: string) => string;
    engineWait: (a: string) => string;
    patrol: (npc: string) => string;
    waitTag: string;
  };
  status: {
    toThink: (dest: string) => string;
    thinkingIn: (room: string) => string;
    bgWalk: string;
    bgCoffee: string;
    rushing: string;
    writing: string;
    shipped: (note: string) => string;
    inspecting: (room: string) => string;
    approval: string;
    walkingTo: (dest: string, box: boolean) => string;
    atDesk: string;
    inRoom: (room: string) => string;
    doing: Record<Doing, string>;
  };
  where: { walking: string; desk: string; floor: string; meeting: string; serverRoom: string };
};

const EN: Strings = {
  tag: { think: " · THINKING", wait: " · WAITING", write: " · WRITING", ok: " · SHIPPED", err: " · ERROR", approval: " · APPROVAL" },
  signs: { datacenter: "DATA CENTER", server: "SERVER ROOM · KERNEL", vault: "VAULT", warehouse: "WAREHOUSE", security: "SECURITY" },
  chars: "chars",
  shipped: (note) => `✓ Shipped · ${note}`,
  stopped: "Stopped.",
  waiting: (reason) => `Waiting — ${reason} ☕`,
  teammates: (n) => `waiting on ${n} teammate${n === 1 ? "" : "s"}`,
  needsApproval: (action) => `Needs approval: ${action}`,
  approved: "Approved — executing.",
  rejected: "Rejected — standing down.",
  vaultNote: "Filing that in the vault.",
  engineCoffee: "Engine is still thinking — coffee ☕",
  lunch: "Lunch.",
  pingpong: (mate) => `${mate}, ping-pong?`,
  cameras: "All quiet on the cameras?",
  smallTalk: [
    "Artifact first.",
    "Truth over comfort.",
    "Did the kernel fit the budget?",
    "Coffee's fresh.",
    "Shipping in five.",
    "Who touched the vault?",
    "Short is a courtesy.",
    "The boring version ships.",
    "Names are promises.",
    "Keep the glass clean.",
  ],
  log: {
    coffee: (a) => `${a} grabbed a coffee`,
    eat: (a) => `${a} is eating in the canteen`,
    pingpong: (a, b) => `${a} and ${b} are playing ping-pong`,
    arcade: (a) => `${a} is on the arcade`,
    box: (a) => `${a} is fetching a box`,
    booth: (a) => `${a} took a call in a focus booth`,
    read: (a) => `${a} is reading in the library`,
    vault: (a) => `${a} checked the vault`,
    server: (a) => `${a} walked the server aisles`,
    engineWait: (a) => `${a} is waiting on the engine — coffee`,
    patrol: (npc) => `${npc} started a patrol`,
    waitTag: "Wait",
  },
  status: {
    toThink: (dest) => `heading to the ${dest} to think`,
    thinkingIn: (room) => `thinking in the ${room}`,
    bgWalk: "background wait — off to the canteen",
    bgCoffee: "waiting on background work — coffee",
    rushing: "rushing back to the desk to write",
    writing: "writing at the desk",
    shipped: (note) => `shipped · ${note}`,
    inspecting: (room) => `inspecting the ${room}`,
    approval: "waiting for your approval",
    walkingTo: (dest, box) => `walking to the ${dest}${box ? " with a box" : ""}`,
    atDesk: "working at the desk",
    inRoom: (room) => `in the ${room}`,
    doing: {
      think: "thinking in the meeting room",
      coffee: "coffee in the canteen",
      eat: "eating in the canteen",
      pingpong: "playing ping-pong",
      arcade: "on the arcade",
      tv: "gaming on the TV",
      warehouse: "fetching a box in the warehouse",
      security: "chatting with security",
      booth: "on a call in a focus booth",
      read: "reading in the library",
      vault: "in the vault",
      server: "walking the server aisles",
      sofa: "resting in the huddle room",
      window: "looking out the window",
      print: "at the printer",
      cooler: "at the water cooler",
      visit: "talking to a teammate",
    },
  },
  where: { walking: "walking", desk: "desk", floor: "the floor", meeting: "meeting room", serverRoom: "server room" },
};

const ID: Strings = {
  tag: { think: " · BERPIKIR", wait: " · MENUNGGU", write: " · MENULIS", ok: " · TERKIRIM", err: " · GALAT", approval: " · PERSETUJUAN" },
  signs: { datacenter: "PUSAT DATA", server: "RUANG SERVER · KERNEL", vault: "BRANKAS", warehouse: "GUDANG", security: "KEAMANAN" },
  chars: "karakter",
  shipped: (note) => `✓ Terkirim · ${note}`,
  stopped: "Dihentikan.",
  waiting: (reason) => `Menunggu — ${reason} ☕`,
  teammates: (n) => `menunggu ${n} rekan`,
  needsApproval: (action) => `Butuh persetujuan: ${action}`,
  approved: "Disetujui — dijalankan.",
  rejected: "Ditolak — tidak dijalankan.",
  vaultNote: "Saya simpan di brankas.",
  engineCoffee: "Engine masih berpikir — ngopi dulu ☕",
  lunch: "Makan siang dulu.",
  pingpong: (mate) => `${mate}, main ping-pong?`,
  cameras: "Kamera aman semua?",
  smallTalk: [
    "Hasil dulu, baru cerita.",
    "Kebenaran di atas kenyamanan.",
    "Kernel-nya muat anggaran?",
    "Kopinya baru diseduh.",
    "Rilis lima menit lagi.",
    "Siapa yang buka brankas?",
    "Singkat itu sopan.",
    "Versi yang membosankan yang rilis.",
    "Nama itu janji.",
    "Jaga kacanya tetap bersih.",
  ],
  log: {
    coffee: (a) => `${a} ambil kopi`,
    eat: (a) => `${a} makan di kantin`,
    pingpong: (a, b) => `${a} dan ${b} main ping-pong`,
    arcade: (a) => `${a} main arcade`,
    box: (a) => `${a} mengambil kotak`,
    booth: (a) => `${a} menerima telepon di bilik fokus`,
    read: (a) => `${a} membaca di perpustakaan`,
    vault: (a) => `${a} mengecek brankas`,
    server: (a) => `${a} menyusuri lorong server`,
    engineWait: (a) => `${a} menunggu engine — ngopi`,
    patrol: (npc) => `${npc} mulai patroli`,
    waitTag: "Tunggu",
  },
  status: {
    toThink: (dest) => `menuju ${dest} untuk berpikir`,
    thinkingIn: (room) => `berpikir di ${room}`,
    bgWalk: "menunggu proses latar — ke kantin",
    bgCoffee: "menunggu proses latar — ngopi",
    rushing: "bergegas kembali ke meja untuk menulis",
    writing: "menulis di meja",
    shipped: (note) => `terkirim · ${note}`,
    inspecting: (room) => `memeriksa ${room}`,
    approval: "menunggu persetujuan Anda",
    walkingTo: (dest, box) => `berjalan ke ${dest}${box ? " membawa kotak" : ""}`,
    atDesk: "bekerja di meja",
    inRoom: (room) => `di ${room}`,
    doing: {
      think: "berpikir di ruang rapat",
      coffee: "ngopi di kantin",
      eat: "makan di kantin",
      pingpong: "main ping-pong",
      arcade: "main arcade",
      tv: "main game di TV",
      warehouse: "mengambil kotak di gudang",
      security: "ngobrol dengan satpam",
      booth: "menelepon di bilik fokus",
      read: "membaca di perpustakaan",
      vault: "di brankas",
      server: "menyusuri lorong server",
      sofa: "santai di ruang diskusi",
      window: "melihat ke luar jendela",
      print: "di printer",
      cooler: "di dispenser air",
      visit: "ngobrol dengan rekan",
    },
  },
  where: { walking: "berjalan", desk: "meja", floor: "lantai", meeting: "ruang rapat", serverRoom: "ruang server" },
};

export function floorText(lang: FloorLang): Strings {
  return lang === "id" ? ID : EN;
}
