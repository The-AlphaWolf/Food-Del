/**
 * Launch catalogue: Tier A (ambient) and Tier B (chilled, air only) delicacies from the four
 * origin cities. Vendors are fictional; the foods, their shelf lives and storage needs are real.
 * GST is 5% throughout (sweetmeats, namkeen, biscuits and pickles after the 2025 rate
 * rationalisation) — the rate is per item and editable by ops.
 */
import type { Diet, TempClass } from "@food-del/domain";

export const CATEGORY_SEED = [
  {
    slug: "mithai",
    name: "Mithai",
    description: "Dry and ghee sweets that travel well.",
    sortOrder: 1,
  },
  {
    slug: "milk-sweets",
    name: "Milk sweets",
    description: "Chhena and khoya sweets, shipped chilled by air.",
    sortOrder: 2,
  },
  {
    slug: "namkeen",
    name: "Namkeen & snacks",
    description: "Crunchy, spiced, made in small batches.",
    sortOrder: 3,
  },
  {
    slug: "bakery",
    name: "Bakes & biscuits",
    description: "Irani-café biscuits and old-school bakes.",
    sortOrder: 4,
  },
  {
    slug: "pickles",
    name: "Pickles & preserves",
    description: "Sun-cured, oil-sealed, months of shelf life.",
    sortOrder: 5,
  },
  {
    slug: "specials",
    name: "Regional specials",
    description: "The dishes each city is known for.",
    sortOrder: 6,
  },
];

export interface VariantSeed {
  label: string;
  rupees: number;
  mrpRupees?: number;
  netG: number;
  packedG: number;
  cap: number;
}

export interface ItemSeed {
  slug: string;
  name: string;
  category: string;
  short: string;
  description: string;
  originStory?: string;
  diet: Diet;
  temp: TempClass;
  shelfLifeHours: number;
  minResidualHours: number;
  /** Omit for made-to-order; set for stock items (max age at dispatch, hours). */
  stockMaxAgeHours?: number;
  ingredients: string;
  allergens: string[];
  storage: string;
  hsn: string;
  art: string;
  featured?: boolean;
  variants: VariantSeed[];
}

export interface VendorSeed {
  slug: string;
  city: string;
  name: string;
  tagline: string;
  story: string;
  established: number;
  pickupPincode: string;
  fssai: string;
  gstin: string;
  orderCutoffLocal?: string;
  prepStartLocal?: string;
  readyForPickupLocal?: string;
  dispatchWeekdays?: number;
  dailyShipmentCap: number;
  commissionBps?: number;
  items: ItemSeed[];
}

const AMBIENT_STORAGE = "Store in a cool, dry place away from sunlight. Keep the box closed.";
const CHILLED_STORAGE =
  "Refrigerate (0–8 °C) on arrival. Bring to room temperature for 10 minutes before serving.";

export const VENDOR_SEED: VendorSeed[] = [
  // ─── Kolkata ────────────────────────────────────────────────────────────────────────────────
  {
    slug: "bagbazar-mishti-ghar",
    city: "kolkata",
    name: "Bagbazar Mishti Ghar",
    tagline: "Chhena sweets from a north Kolkata lane, since 1921",
    story:
      "Four generations have pressed chhena by hand in the same Bagbazar kitchen. Nolen gur arrives from Nadia every winter; the sandesh is set in the afternoon and boxed the next morning.",
    established: 1921,
    pickupPincode: "700003",
    fssai: "12826011000101",
    gstin: "19AABFB1234C1Z5",
    readyForPickupLocal: "11:30",
    dailyShipmentCap: 80,
    items: [
      {
        slug: "nolen-gur-sandesh",
        name: "Nolen Gur Sandesh",
        category: "milk-sweets",
        short: "Soft chhena sandesh sweetened with winter date-palm jaggery.",
        description:
          "Hand-pressed chhena folded with fresh nolen gur and set in carved wooden moulds. Delicate, smoky-sweet and barely firm — eat within three days of making.",
        originStory:
          "Nolen gur is tapped from date palms only in the cold months, which is why Kolkata waits for winter.",
        diet: "VEG",
        temp: "CHILLED",
        shelfLifeHours: 72,
        minResidualHours: 22,
        ingredients: "Chhena (cow milk), nolen gur (date-palm jaggery), sugar, cardamom",
        allergens: ["Milk"],
        storage: CHILLED_STORAGE,
        hsn: "21069099",
        art: "sandesh",
        featured: true,
        variants: [
          { label: "Box of 12 (480 g)", rupees: 540, netG: 480, packedG: 560, cap: 40 },
          { label: "Box of 24 (960 g)", rupees: 1020, netG: 960, packedG: 1080, cap: 20 },
        ],
      },
      {
        slug: "baked-rosogolla",
        name: "Baked Rosogolla",
        category: "milk-sweets",
        short: "Rosogolla baked in thickened milk until caramel-gold.",
        description:
          "Spongy rosogolla slow-baked in reduced milk until the tops blister. Rich, warm-tasting and best served slightly chilled.",
        diet: "VEG",
        temp: "CHILLED",
        shelfLifeHours: 96,
        minResidualHours: 29,
        ingredients: "Chhena, milk, sugar, cardamom",
        allergens: ["Milk"],
        storage: CHILLED_STORAGE,
        hsn: "21069099",
        art: "rosogolla",
        variants: [{ label: "Box of 10 (500 g)", rupees: 420, netG: 500, packedG: 620, cap: 30 }],
      },
      {
        slug: "canned-rosogolla",
        name: "Rosogolla in a Tin",
        category: "mithai",
        short: "Kolkata's rosogolla, sealed in syrup — keeps for months.",
        description:
          "The same springy rosogolla, cooked and canned in light syrup on the day of making. The traveller's choice: no refrigeration until opened.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 4320,
        minResidualHours: 1296,
        stockMaxAgeHours: 720,
        ingredients: "Chhena, sugar, water",
        allergens: ["Milk"],
        storage: "Store below 30 °C. Once opened, refrigerate and finish within 2 days.",
        hsn: "21069099",
        art: "rosogolla",
        variants: [
          { label: "500 g tin (8 pcs)", rupees: 210, netG: 500, packedG: 600, cap: 80 },
          { label: "1 kg tin (16 pcs)", rupees: 380, netG: 1000, packedG: 1150, cap: 60 },
        ],
      },
      {
        slug: "kacha-golla",
        name: "Kacha Golla",
        category: "milk-sweets",
        short: "Barely-cooked chhena balls — the most fragile sweet in Bengal.",
        description:
          "Fresh chhena kneaded with sugar and rolled while still warm. It lasts two days, so it only reaches cities a short flight away.",
        diet: "VEG",
        temp: "CHILLED",
        shelfLifeHours: 48,
        minResidualHours: 15,
        ingredients: "Chhena, sugar",
        allergens: ["Milk"],
        storage: CHILLED_STORAGE,
        hsn: "21069099",
        art: "sandesh",
        variants: [{ label: "250 g (10 pcs)", rupees: 260, netG: 250, packedG: 320, cap: 25 }],
      },
      {
        slug: "joynagarer-moa",
        name: "Joynagarer Moa",
        category: "mithai",
        short: "Puffed kanakchur rice bound with nolen gur and khoya.",
        description:
          "A winter sweet from Joynagar: fragrant puffed rice, date-palm jaggery and a little khoya, pressed into soft balls.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 168,
        minResidualHours: 51,
        ingredients: "Kanakchur khoi (puffed rice), nolen gur, khoya, ghee, cardamom",
        allergens: ["Milk"],
        storage: AMBIENT_STORAGE,
        hsn: "21069099",
        art: "laddoo",
        variants: [{ label: "Box of 10 (400 g)", rupees: 450, netG: 400, packedG: 470, cap: 40 }],
      },
    ],
  },
  {
    slug: "college-street-chanachur",
    city: "kolkata",
    name: "College Street Chanachur Co.",
    tagline: "The adda snack of Kolkata's book street",
    story:
      "Roasted in an iron karai in small batches, the way the coffee-house crowd has eaten it for decades.",
    established: 1962,
    pickupPincode: "700073",
    fssai: "12826011000102",
    gstin: "19AACCC4321D1Z2",
    dispatchWeekdays: 127,
    dailyShipmentCap: 120,
    commissionBps: 1800,
    items: [
      {
        slug: "kolkata-chanachur",
        name: "Kolkata Chanachur",
        category: "namkeen",
        short: "Sharp, tangy mix of sev, peanuts, lentils and curry leaves.",
        description:
          "Besan sev, roasted peanuts, fried masoor and chana, finished with black salt, amchur and a whisper of mustard oil.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 2160,
        minResidualHours: 648,
        stockMaxAgeHours: 336,
        ingredients: "Gram flour, peanuts, lentils, mustard oil, spices, salt",
        allergens: ["Peanuts"],
        storage: AMBIENT_STORAGE,
        hsn: "21069099",
        art: "namkeen",
        variants: [
          { label: "400 g", rupees: 180, netG: 400, packedG: 440, cap: 100 },
          { label: "1 kg", rupees: 420, netG: 1000, packedG: 1080, cap: 60 },
        ],
      },
      {
        slug: "nimki",
        name: "Nimki",
        category: "namkeen",
        short: "Flaky, kalonji-studded diamond crackers.",
        description:
          "Maida layered with ghee, cut into diamonds and fried slowly until they shatter. The Bijoya Dashami snack.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 720,
        minResidualHours: 216,
        stockMaxAgeHours: 168,
        ingredients: "Refined wheat flour, ghee, kalonji, salt, vegetable oil",
        allergens: ["Gluten", "Milk"],
        storage: AMBIENT_STORAGE,
        hsn: "21069099",
        art: "namkeen",
        variants: [{ label: "300 g", rupees: 150, netG: 300, packedG: 340, cap: 80 }],
      },
      {
        slug: "narkel-naru",
        name: "Narkel Naru",
        category: "mithai",
        short: "Coconut and jaggery laddoos, rolled by hand.",
        description:
          "Freshly grated coconut cooked down with gur until it just holds, then rolled warm. Chewy, caramel-edged and homely.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 168,
        minResidualHours: 51,
        ingredients: "Coconut, jaggery, cardamom",
        allergens: [],
        storage: AMBIENT_STORAGE,
        hsn: "21069099",
        art: "laddoo",
        variants: [{ label: "Box of 12 (360 g)", rupees: 320, netG: 360, packedG: 420, cap: 50 }],
      },
    ],
  },

  // ─── Hyderabad ──────────────────────────────────────────────────────────────────────────────
  {
    slug: "nampally-bakehouse",
    city: "hyderabad",
    name: "Nampally Bakehouse",
    tagline: "Irani-café biscuits, baked before the first chai",
    story:
      "Wood-fired ovens near the old station have turned out Osmania biscuits every dawn since 1953 — salty-sweet, buttery, built for dunking.",
    established: 1953,
    pickupPincode: "500001",
    fssai: "13626011000201",
    gstin: "36AAFFN5678E1Z1",
    dailyShipmentCap: 150,
    items: [
      {
        slug: "osmania-biscuits",
        name: "Osmania Biscuits",
        category: "bakery",
        short: "The salty-sweet butter biscuit of every Irani café.",
        description:
          "Short, crumbly and faintly salty, made with butter and a hint of cardamom. Named for the last Nizam, made for Irani chai.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 1080,
        minResidualHours: 324,
        stockMaxAgeHours: 168,
        ingredients: "Refined wheat flour, butter, sugar, milk solids, salt, cardamom",
        allergens: ["Gluten", "Milk"],
        storage: AMBIENT_STORAGE,
        hsn: "19053100",
        art: "biscuit",
        featured: true,
        variants: [
          { label: "400 g", rupees: 240, netG: 400, packedG: 470, cap: 120 },
          { label: "800 g", rupees: 460, netG: 800, packedG: 920, cap: 60 },
        ],
      },
      {
        slug: "hyderabadi-fruit-biscuits",
        name: "Karachi-style Fruit Biscuits",
        category: "bakery",
        short: "Tutti-frutti studded biscuits with a crisp snap.",
        description:
          "Buttery biscuits packed with candied fruit and cashew, baked thin and crisp. Hyderabad's most-gifted bake.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 1440,
        minResidualHours: 432,
        stockMaxAgeHours: 240,
        ingredients: "Refined wheat flour, butter, sugar, candied fruit, cashew, milk solids",
        allergens: ["Gluten", "Milk", "Tree nuts"],
        storage: AMBIENT_STORAGE,
        hsn: "19053100",
        art: "biscuit",
        variants: [{ label: "400 g", rupees: 280, netG: 400, packedG: 470, cap: 120 }],
      },
      {
        slug: "badam-ki-jaali",
        name: "Badam ki Jaali",
        category: "mithai",
        short: "Almond marzipan pressed into lace-like discs.",
        description:
          "A Nizami court sweet: ground almonds and sugar rolled thin and stamped with a fine jaali pattern, then air-dried.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 360,
        minResidualHours: 108,
        ingredients: "Almonds, sugar, rose water, edible silver leaf",
        allergens: ["Tree nuts"],
        storage: AMBIENT_STORAGE,
        hsn: "21069099",
        art: "barfi",
        variants: [{ label: "250 g", rupees: 520, netG: 250, packedG: 310, cap: 30 }],
      },
    ],
  },
  {
    slug: "old-city-sweets-and-pickles",
    city: "hyderabad",
    name: "Old City Sweets & Pickles",
    tagline: "Wedding desserts and Andhra pickles from near Charminar",
    story:
      "A family kitchen that cooks for Old City weddings, and bottles its pickles every summer when the mangoes and gongura come in.",
    established: 1978,
    pickupPincode: "500002",
    fssai: "13626011000202",
    gstin: "36AAGFO9876F1Z9",
    dailyShipmentCap: 60,
    items: [
      {
        slug: "qubani-ka-meetha",
        name: "Qubani ka Meetha",
        category: "specials",
        short: "Stewed Hunza apricots in syrup — the Hyderabadi wedding dessert.",
        description:
          "Dried apricots soaked overnight, slow-stewed until jammy and finished with their own blanched kernels. Serve chilled with cream.",
        diet: "VEG",
        temp: "CHILLED",
        shelfLifeHours: 120,
        minResidualHours: 36,
        ingredients: "Dried apricots, sugar, apricot kernels",
        allergens: ["Tree nuts"],
        storage: CHILLED_STORAGE,
        hsn: "20079990",
        art: "jar",
        featured: true,
        variants: [{ label: "500 g jar", rupees: 450, netG: 500, packedG: 820, cap: 30 }],
      },
      {
        slug: "double-ka-meetha",
        name: "Double ka Meetha",
        category: "specials",
        short: "Fried bread pudding soaked in saffron milk.",
        description:
          "Thick slices of bread fried in ghee, soaked in saffron-cardamom syrup and reduced milk. Made the morning it ships.",
        diet: "VEG",
        temp: "CHILLED",
        shelfLifeHours: 48,
        minResidualHours: 15,
        ingredients: "Bread, ghee, milk, sugar, saffron, cardamom, dry fruits",
        allergens: ["Gluten", "Milk", "Tree nuts"],
        storage: CHILLED_STORAGE,
        hsn: "21069099",
        art: "halwa",
        variants: [{ label: "500 g tray", rupees: 380, netG: 500, packedG: 640, cap: 20 }],
      },
      {
        slug: "gongura-pickle",
        name: "Gongura Pickle",
        category: "pickles",
        short: "Tangy sorrel-leaf pickle, sharp with garlic and red chilli.",
        description:
          "Sour gongura leaves sautéed with garlic, Guntur chillies and sesame oil, then cured for a fortnight.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 4320,
        minResidualHours: 1296,
        stockMaxAgeHours: 720,
        ingredients: "Gongura leaves, sesame oil, red chilli, garlic, salt, spices",
        allergens: ["Sesame"],
        storage: "Keep the lid tight and use a dry spoon.",
        hsn: "20019000",
        art: "pickle",
        variants: [{ label: "300 g jar", rupees: 240, netG: 300, packedG: 520, cap: 60 }],
      },
      {
        slug: "avakaya-mango-pickle",
        name: "Avakaya Mango Pickle",
        category: "pickles",
        short: "Raw mango chunks in mustard, chilli and sesame oil.",
        description:
          "Summer's hard green mangoes cut with the stone, cured in mustard powder, chilli and cold-pressed sesame oil.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 4320,
        minResidualHours: 1296,
        stockMaxAgeHours: 720,
        ingredients: "Raw mango, sesame oil, mustard, red chilli, salt, fenugreek",
        allergens: ["Mustard", "Sesame"],
        storage: "Keep the lid tight and use a dry spoon.",
        hsn: "20019000",
        art: "pickle",
        variants: [{ label: "300 g jar", rupees: 260, netG: 300, packedG: 520, cap: 60 }],
      },
    ],
  },

  // ─── Delhi NCR ──────────────────────────────────────────────────────────────────────────────
  {
    slug: "chandni-chowk-halwai",
    city: "delhi-ncr",
    name: "Chandni Chowk Halwai & Sons",
    tagline: "Halwa and mithai from the walled city, since 1896",
    story:
      "The kadhai has moved stoves three times in 130 years but never left the gali. Sohan halwa is still stirred for six hours over a wood fire.",
    established: 1896,
    pickupPincode: "110006",
    fssai: "13326011000301",
    gstin: "07AABFC2468G1Z3",
    dailyShipmentCap: 100,
    items: [
      {
        slug: "kaju-katli",
        name: "Kaju Katli",
        category: "mithai",
        short: "Silver-leafed cashew fudge, thin and melt-soft.",
        description:
          "Ground cashews cooked with sugar to a soft-ball stage, rolled thin and cut into diamonds. No khoya, so it travels beautifully.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 240,
        minResidualHours: 72,
        ingredients: "Cashew nuts, sugar, edible silver leaf",
        allergens: ["Tree nuts"],
        storage: AMBIENT_STORAGE,
        hsn: "21069099",
        art: "barfi",
        featured: true,
        variants: [
          { label: "500 g", rupees: 650, netG: 500, packedG: 560, cap: 60 },
          { label: "1 kg", rupees: 1250, netG: 1000, packedG: 1100, cap: 40 },
        ],
      },
      {
        slug: "sohan-halwa",
        name: "Sohan Halwa",
        category: "mithai",
        short: "Brittle ghee halwa with pistachio and almond.",
        description:
          "Wheat, milk and sugar caramelised in desi ghee for hours until it sets like toffee, studded with nuts. Keeps for weeks.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 1440,
        minResidualHours: 432,
        stockMaxAgeHours: 240,
        ingredients: "Ghee, sugar, wheat, milk, pistachio, almond, cardamom",
        allergens: ["Gluten", "Milk", "Tree nuts"],
        storage: AMBIENT_STORAGE,
        hsn: "21069099",
        art: "halwa",
        featured: true,
        variants: [
          { label: "500 g", rupees: 560, netG: 500, packedG: 580, cap: 50 },
          { label: "1 kg", rupees: 1080, netG: 1000, packedG: 1120, cap: 30 },
        ],
      },
      {
        slug: "habshi-halwa",
        name: "Habshi Halwa",
        category: "mithai",
        short: "Dark, chewy halwa of sprouted wheat and milk.",
        description:
          "Sprouted wheat and milk slow-cooked until deep brown and fudgy, scented with saffron. A winter classic of old Delhi.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 480,
        minResidualHours: 144,
        ingredients: "Milk, sprouted wheat, ghee, sugar, saffron, dry fruits",
        allergens: ["Gluten", "Milk", "Tree nuts"],
        storage: AMBIENT_STORAGE,
        hsn: "21069099",
        art: "halwa",
        variants: [{ label: "500 g", rupees: 620, netG: 500, packedG: 580, cap: 30 }],
      },
      {
        slug: "motichoor-laddoo",
        name: "Motichoor Laddoo",
        category: "mithai",
        short: "Tiny saffron boondi pressed into soft laddoos.",
        description:
          "Pin-head boondi fried in ghee, soaked in syrup and shaped by hand while warm. Best within five days.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 120,
        minResidualHours: 36,
        ingredients: "Gram flour, ghee, sugar, saffron, melon seeds",
        allergens: ["Milk"],
        storage: AMBIENT_STORAGE,
        hsn: "21069099",
        art: "laddoo",
        variants: [{ label: "Box of 12 (500 g)", rupees: 380, netG: 500, packedG: 580, cap: 50 }],
      },
      {
        slug: "dodha-barfi",
        name: "Dodha Barfi",
        category: "mithai",
        short: "Grainy, caramelised milk barfi with walnuts.",
        description:
          "Milk reduced with sprouted wheat and sugar until it caramelises, set with walnuts. Nutty, dense and not too sweet.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 360,
        minResidualHours: 108,
        ingredients: "Milk, sugar, sprouted wheat, ghee, walnuts",
        allergens: ["Gluten", "Milk", "Tree nuts"],
        storage: AMBIENT_STORAGE,
        hsn: "21069099",
        art: "barfi",
        variants: [{ label: "500 g", rupees: 520, netG: 500, packedG: 580, cap: 40 }],
      },
    ],
  },
  {
    slug: "daryaganj-namkeen-bhandar",
    city: "delhi-ncr",
    name: "Daryaganj Namkeen Bhandar",
    tagline: "Mathri and dal moth for the Delhi chai hour",
    story: "Three brothers, one fryer and a recipe ledger older than Partition.",
    established: 1951,
    pickupPincode: "110002",
    fssai: "13326011000302",
    gstin: "07AACFD1357H1Z7",
    dispatchWeekdays: 127,
    dailyShipmentCap: 120,
    commissionBps: 1800,
    items: [
      {
        slug: "dal-moth",
        name: "Dal Moth",
        category: "namkeen",
        short: "Crisp moth beans and sev, tossed with Delhi masala.",
        description:
          "Fried moth dal, fine sev and peanuts with a tart, peppery masala. Endlessly snackable.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 2160,
        minResidualHours: 648,
        stockMaxAgeHours: 336,
        ingredients: "Moth beans, gram flour, peanuts, vegetable oil, spices, salt",
        allergens: ["Peanuts"],
        storage: AMBIENT_STORAGE,
        hsn: "21069099",
        art: "namkeen",
        variants: [{ label: "400 g", rupees: 160, netG: 400, packedG: 440, cap: 100 }],
      },
      {
        slug: "ajwain-mathri",
        name: "Ajwain Mathri",
        category: "namkeen",
        short: "Flaky carom-seed crackers, fried slow in ghee.",
        description:
          "Hand-rolled flour discs with ajwain and crushed pepper, pricked and fried low until flaky. Made for achaar and chai.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 720,
        minResidualHours: 216,
        stockMaxAgeHours: 168,
        ingredients: "Refined wheat flour, ghee, ajwain, black pepper, salt",
        allergens: ["Gluten", "Milk"],
        storage: AMBIENT_STORAGE,
        hsn: "21069099",
        art: "biscuit",
        variants: [{ label: "Box of 20 (400 g)", rupees: 280, netG: 400, packedG: 470, cap: 80 }],
      },
    ],
  },

  // ─── Bengaluru ──────────────────────────────────────────────────────────────────────────────
  {
    slug: "chamarajpet-ghee-sweets",
    city: "bengaluru",
    name: "Chamarajpet Ghee Sweets",
    tagline: "Mysore pak the way the palace kitchens made it",
    story:
      "Started by a cook from the Mysore palace kitchens in 1937. The pak is still poured hot into ghee-lined trays and cut before it sets.",
    established: 1937,
    pickupPincode: "560018",
    fssai: "11226011000401",
    gstin: "29AABFC8642J1Z4",
    dailyShipmentCap: 90,
    items: [
      {
        slug: "mysore-pak",
        name: "Ghee Mysore Pak",
        category: "mithai",
        short: "Porous, melt-in-the-mouth gram-flour and ghee sweet.",
        description:
          "Besan cooked in a torrent of hot ghee until it foams and sets with a honeycomb crumb. Soft, rich and fragrant.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 480,
        minResidualHours: 144,
        ingredients: "Ghee, gram flour, sugar",
        allergens: ["Milk"],
        storage: AMBIENT_STORAGE,
        hsn: "21069099",
        art: "pak",
        featured: true,
        variants: [
          { label: "500 g", rupees: 480, netG: 500, packedG: 560, cap: 60 },
          { label: "1 kg", rupees: 920, netG: 1000, packedG: 1100, cap: 30 },
        ],
      },
      {
        slug: "dharwad-peda",
        name: "Dharwad Peda",
        category: "mithai",
        short: "Caramelised milk peda rolled in sugar.",
        description:
          "Milk cooked down for hours until it browns and turns grainy, then shaped and rolled in powdered sugar.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 240,
        minResidualHours: 72,
        ingredients: "Milk, sugar, cardamom",
        allergens: ["Milk"],
        storage: AMBIENT_STORAGE,
        hsn: "21069099",
        art: "peda",
        variants: [{ label: "500 g", rupees: 420, netG: 500, packedG: 560, cap: 50 }],
      },
      {
        slug: "chiroti",
        name: "Chiroti",
        category: "mithai",
        short: "Layered, flaky pastry dusted with sugar.",
        description:
          "Paper-thin layers of dough fried until they bloom, dusted with powdered sugar and cardamom. Served with warm badam milk at weddings.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 168,
        minResidualHours: 51,
        ingredients: "Semolina, refined wheat flour, ghee, sugar, cardamom",
        allergens: ["Gluten", "Milk"],
        storage: AMBIENT_STORAGE,
        hsn: "21069099",
        art: "biscuit",
        variants: [{ label: "Box of 8", rupees: 360, netG: 320, packedG: 420, cap: 30 }],
      },
      {
        slug: "obbattu",
        name: "Bele Obbattu",
        category: "specials",
        short: "Jaggery-lentil flatbread brushed with ghee.",
        description:
          "Soft flatbread stuffed with chana dal and jaggery, griddled with ghee. Made at dawn on dispatch day.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 72,
        minResidualHours: 22,
        ingredients: "Wheat flour, chana dal, jaggery, ghee, cardamom",
        allergens: ["Gluten", "Milk"],
        storage: AMBIENT_STORAGE,
        hsn: "21069099",
        art: "halwa",
        variants: [{ label: "Pack of 6", rupees: 300, netG: 480, packedG: 560, cap: 25 }],
      },
    ],
  },
  {
    slug: "malleshwaram-snack-works",
    city: "bengaluru",
    name: "Malleshwaram Snack Works",
    tagline: "Bengaluru's bakery-counter snacks, fried fresh",
    story:
      "A corner shop near 8th Cross where the queue for Congress kadlekai starts before the shutters open.",
    established: 1972,
    pickupPincode: "560003",
    fssai: "11226011000402",
    gstin: "29AACFM7531K1Z6",
    dispatchWeekdays: 127,
    dailyShipmentCap: 120,
    commissionBps: 1800,
    items: [
      {
        slug: "congress-kadlekai",
        name: "Congress Kadlekai",
        category: "namkeen",
        short: "Split roasted peanuts with curry leaf and chilli.",
        description:
          "Peanuts roasted, split and tossed with curry leaves, chilli powder and a little hing. A Bengaluru original.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 1440,
        minResidualHours: 432,
        stockMaxAgeHours: 240,
        ingredients: "Peanuts, curry leaves, chilli powder, vegetable oil, salt, asafoetida",
        allergens: ["Peanuts"],
        storage: AMBIENT_STORAGE,
        hsn: "20081100",
        art: "namkeen",
        variants: [{ label: "400 g", rupees: 220, netG: 400, packedG: 440, cap: 100 }],
      },
      {
        slug: "nippattu",
        name: "Nippattu",
        category: "namkeen",
        short: "Crisp rice crackers with peanuts and curry leaf.",
        description:
          "Rice-flour discs with roasted gram, peanuts and curry leaves, fried until they crackle.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 720,
        minResidualHours: 216,
        stockMaxAgeHours: 168,
        ingredients: "Rice flour, peanuts, roasted gram, curry leaves, chilli, vegetable oil, salt",
        allergens: ["Peanuts"],
        storage: AMBIENT_STORAGE,
        hsn: "21069099",
        art: "biscuit",
        variants: [{ label: "300 g", rupees: 180, netG: 300, packedG: 340, cap: 80 }],
      },
      {
        slug: "benne-murukku",
        name: "Benne Murukku",
        category: "namkeen",
        short: "Butter-rich murukku spirals.",
        description:
          "Rice and urad flour enriched with butter, piped into spirals and fried golden. Light and short.",
        diet: "VEG",
        temp: "AMBIENT",
        shelfLifeHours: 720,
        minResidualHours: 216,
        stockMaxAgeHours: 168,
        ingredients: "Rice flour, urad dal flour, butter, sesame, salt, vegetable oil",
        allergens: ["Milk", "Sesame"],
        storage: AMBIENT_STORAGE,
        hsn: "21069099",
        art: "namkeen",
        variants: [{ label: "300 g", rupees: 200, netG: 300, packedG: 340, cap: 80 }],
      },
    ],
  },
];
