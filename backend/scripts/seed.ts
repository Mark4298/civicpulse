import type {
  Complaint,
  ComplaintCategory,
  ComplaintLanguage,
  ComplaintSeverity,
  ComplaintSource,
  District,
} from "../../shared/types.js";
import { INDIA_SEED_DISTRICTS } from "../src/services/districts.js";

const CATEGORIES: ComplaintCategory[] = [
  "roads",
  "water",
  "electricity",
  "sanitation",
  "healthcare",
  "internet",
];
type SeedLanguage = Extract<ComplaintLanguage, "en" | "hi" | "bn" | "ta">;
const LANGUAGES: SeedLanguage[] = ["en", "hi", "bn", "ta"];
const SOURCES: ComplaintSource[] = ["text", "voice", "messaging"];
const SEVERITIES: ComplaintSeverity[] = [1, 2, 3, 4, 5];
const MESSAGES: Record<SeedLanguage, string[]> = {
  en: [
    "Potholes on the main road remain unrepaired.",
    "Water supply is irregular in this neighborhood.",
    "Frequent power cuts are disrupting daily work.",
    "Garbage has not been collected from the street.",
    "The local clinic needs staff and essential medicines.",
    "Mobile internet connectivity is unreliable in this area.",
  ],
  hi: [
    "मुख्य सड़क के गड्ढों की मरम्मत नहीं हुई है।",
    "इस मोहल्ले में पानी की आपूर्ति अनियमित है।",
    "बार-बार बिजली कटने से रोज़मर्रा का काम प्रभावित है।",
    "सड़क से कचरा नहीं उठाया गया है।",
    "स्थानीय क्लिनिक में कर्मचारी और ज़रूरी दवाइयाँ चाहिए।",
    "इस इलाके में मोबाइल इंटरनेट ठीक से नहीं चलता।",
  ],
  bn: [
    "প্রধান সড়কের গর্তগুলো এখনও মেরামত করা হয়নি।",
    "এই এলাকায় পানীয় জলের সরবরাহ অনিয়মিত।",
    "ঘন ঘন বিদ্যুৎ বিভ্রাটে দৈনন্দিন কাজ ব্যাহত হচ্ছে।",
    "রাস্তা থেকে আবর্জনা সংগ্রহ করা হয়নি।",
    "স্থানীয় ক্লিনিকে কর্মী ও প্রয়োজনীয় ওষুধ দরকার।",
    "এই এলাকায় মোবাইল ইন্টারনেট সংযোগ নির্ভরযোগ্য নয়।",
  ],
  ta: [
    "முக்கிய சாலையில் உள்ள பள்ளங்கள் இன்னும் சரிசெய்யப்படவில்லை.",
    "இந்தப் பகுதியில் குடிநீர் விநியோகம் சீராக இல்லை.",
    "அடிக்கடி மின்வெட்டு ஏற்படுவதால் அன்றாடப் பணி பாதிக்கப்படுகிறது.",
    "தெருவிலிருந்து குப்பை அகற்றப்படவில்லை.",
    "உள்ளூர் மருத்துவமனைக்கு பணியாளர்களும் அத்தியாவசிய மருந்துகளும் தேவை.",
    "இந்தப் பகுதியில் கைப்பேசி இணைய இணைப்பு நம்பகமாக இல்லை.",
  ],
};

type SeedData = { districts: District[]; complaints: Complaint[] };

function createSeedData(): SeedData {
  const districts: District[] = INDIA_SEED_DISTRICTS.map((district) => ({ ...district }));
  const complaints = districts.flatMap((district, districtIndex) =>
    Array.from({ length: 4 }, (_, itemIndex): Complaint => {
      const categoryIndex = (districtIndex + itemIndex) % CATEGORIES.length;
      const languageIndex = (districtIndex + itemIndex) % LANGUAGES.length;
      const category = CATEGORIES[categoryIndex]!;
      const detectedLanguage = LANGUAGES[languageIndex]!;
      return {
        id: `demo-${district.id}-${itemIndex + 1}`,
        userId: null,
        status: "submitted",
        rawText: MESSAGES[detectedLanguage][categoryIndex]!,
        translatedText: MESSAGES.en[categoryIndex]!,
        detectedLanguage,
        category,
        severity: SEVERITIES[(districtIndex + itemIndex) % SEVERITIES.length]!,
        districtId: district.id,
        lat: district.lat,
        lng: district.lng,
        timestamp: new Date(Date.UTC(2025, 0, districtIndex * 4 + itemIndex + 1)).toISOString(),
        source: SOURCES[itemIndex % SOURCES.length]!,
      };
    }),
  );
  return { districts, complaints };
}

function validateSeedData(data: SeedData) {
  const districtIds = new Set(data.districts.map(({ id }) => id));
  const states = new Set(data.districts.map(({ state }) => state));
  const languages = new Set(data.complaints.map(({ detectedLanguage }) => detectedLanguage));
  if (
    data.districts.length < 25 ||
    data.districts.length > 28 ||
    states.size < 10 ||
    data.districts.some(({ country }) => country !== "India") ||
    data.complaints.length !== data.districts.length * 4 ||
    LANGUAGES.some((language) => !languages.has(language)) ||
    data.complaints.some((complaint) => !districtIds.has(complaint.districtId))
  ) {
    throw new Error("Seed must contain 25-28 India districts across states and four complaint languages.");
  }
}

// Writes each record once and never exceeds Firestore's 500 writes per batch.
async function writeInBatches<T extends { id: string }>(
  db: import("firebase-admin/firestore").Firestore,
  collectionName: string,
  records: readonly T[],
) {
  for (let offset = 0; offset < records.length; offset += 500) {
    const batch = db.batch();
    for (const record of records.slice(offset, offset + 500)) {
      batch.set(db.collection(collectionName).doc(record.id), { ...record });
    }
    await batch.commit();
    console.info(`[seed] Wrote ${Math.min(offset + 500, records.length)} ${collectionName} records.`);
  }
}

async function main() {
  const { districts, complaints } = createSeedData();
  validateSeedData({ districts, complaints });
  console.info(`[seed] Validated ${districts.length} India districts and ${complaints.length} complaints.`);

  if (process.argv.includes("--validate-only")) return;

  const { db } = await import("../src/config/firebase.js");
  if (!db) throw new Error("Firestore seed requires Firebase Admin credentials in the environment.");
  await writeInBatches(db, "districts", districts);
  await writeInBatches(db, "complaints", complaints);
  console.info("[seed] Firestore seed completed.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[seed] Failed: ${message}`);
  process.exitCode = 1;
});
