import type { WorkspaceData } from "@/lib/types";
import { addDays, addMinutes, combineDateAndTime, getTodayInputValue } from "@/lib/time";

const STORAGE_KEY = "midnight-tokyo-club-demo-v1";

function makeId(prefix: string) {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createDemoWorkspace(): WorkspaceData {
  const today = getTodayInputValue();
  const tomorrow = addDays(new Date(), 1);
  const tomorrowInput = getTodayInputValueFromDate(tomorrow);
  const storeA = "store-shibuya";
  const storeB = "store-daikoku";
  const staffA = "staff-ren";
  const staffB = "staff-akira";
  const serviceA = "service-c1-midnight";
  const serviceB = "service-daikoku-access";
  const customerA = "customer-mia";
  const customerB = "customer-lee";
  const startA = combineDateAndTime(today, "10:00");
  const endA = addMinutes(startA, 60);
  const startB = combineDateAndTime(tomorrowInput, "14:30");
  const endB = addMinutes(startB, 45);

  return {
    stores: [
      {
        id: storeA,
        name: "Midnight Tokyo Club",
        slug: "midnight-tokyo-club",
        address: "Shibuya private meet point",
        region: "Tokyo",
        city: "Shibuya",
        description: "Premium JDM night access with vetted local guides, cinematic routes, and private booking control.",
        hero_image_url: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1600&q=80",
        timezone: "Asia/Tokyo",
        cancellation_hours: 24,
        line_enabled: true,
        reminder_enabled: true,
        google_calendar_enabled: true,
        public_booking_enabled: true
      },
      {
        id: storeB,
        name: "Daikoku Private Gate",
        slug: "daikoku-private-gate",
        address: "Yokohama transfer point",
        region: "Kanagawa",
        city: "Yokohama",
        description: "Limited-access Daikoku and garage visit coordination for small groups and VIP guests.",
        hero_image_url: "https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=1600&q=80",
        timezone: "Asia/Tokyo",
        cancellation_hours: 12,
        line_enabled: false,
        reminder_enabled: true,
        google_calendar_enabled: false,
        public_booking_enabled: true
      }
    ],
    staff: [
      { id: staffA, store_id: storeA, name: "Ren Takeda", role: "C1 Route Host", active: true, color: "#C9A84C" },
      { id: staffB, store_id: storeA, name: "Akira Mori", role: "Garage Concierge", active: true, color: "#2EC4B6" },
      { id: "staff-yui", store_id: storeB, name: "Yui Sato", role: "Daikoku Coordinator", active: true, color: "#E63946" }
    ],
    services: [
      {
        id: serviceA,
        store_id: storeA,
        name: "C1 Midnight Run",
        category: "Signature",
        description: "A late-night Tokyo route built around Shibuya lights, C1 mythology, and real local car culture.",
        route: "Shibuya / C1 / Tokyo Tower",
        highlights: ["Private guide", "Cinematic photo stops", "English-first concierge"],
        cover_image_url: "https://images.unsplash.com/photo-1494587351196-bbf5f29cff42?auto=format&fit=crop&w=1400&q=80",
        rating: 4.92,
        review_count: 148,
        max_guests: 4,
        remaining_seats: 4,
        featured: true,
        duration_minutes: 150,
        price_cents: 38000,
        active: true
      },
      {
        id: serviceB,
        store_id: storeA,
        name: "Private Garage Access",
        category: "VIP",
        description: "A quiet, high-touch garage visit with builder stories, car walkarounds, and optional filming support.",
        route: "Shibuya / Private garage / Night city shoot",
        highlights: ["Private garage", "Builder context", "VIP transfer option"],
        cover_image_url: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1400&q=80",
        rating: 4.88,
        review_count: 83,
        max_guests: 6,
        remaining_seats: 3,
        featured: true,
        duration_minutes: 120,
        price_cents: 52000,
        active: true
      },
      {
        id: "service-daikoku",
        store_id: storeB,
        name: "Daikoku Night Meet",
        category: "Culture",
        description: "A compact night meet experience focused on etiquette, access timing, and real-time route judgment.",
        route: "Yokohama / Daikoku PA / Bay route",
        highlights: ["Small group", "Live meet timing", "Local etiquette briefing"],
        cover_image_url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=80",
        rating: 4.81,
        review_count: 112,
        max_guests: 5,
        remaining_seats: 5,
        featured: false,
        duration_minutes: 105,
        price_cents: 29000,
        active: true
      }
    ],
    customers: [
      {
        id: customerA,
        store_id: storeA,
        name: "Mia Anderson",
        email: "mia@example.com",
        phone: "+81 90 1234 5678",
        memo: "Prefers quiet rooms. VIP customer.",
        line_user_id: null
      },
      {
        id: customerB,
        store_id: storeA,
        name: "Lee Carter",
        email: "lee@example.com",
        phone: "+81 80 9999 2020",
        memo: "Asked about monthly plan.",
        line_user_id: null
      }
    ],
    reservations: [
      {
        id: "reservation-1",
        store_id: storeA,
        staff_id: staffA,
        service_id: serviceA,
        customer_id: customerA,
        starts_at: startA.toISOString(),
        ends_at: endA.toISOString(),
        status: "confirmed",
        memo: "First visit. Send intake form.",
        payment_status: "paid",
        payment_url: null,
        line_notification_status: "sent",
        reminder_status: "pending",
        google_event_id: "demo-event-1"
      },
      {
        id: "reservation-2",
        store_id: storeA,
        staff_id: staffB,
        service_id: serviceB,
        customer_id: customerB,
        starts_at: startB.toISOString(),
        ends_at: endB.toISOString(),
        status: "confirmed",
        memo: "Wants receipt after payment.",
        payment_status: "pending",
        payment_url: null,
        line_notification_status: "pending",
        reminder_status: "pending",
        google_event_id: null
      }
    ]
  };
}

export function loadDemoWorkspace() {
  if (typeof window === "undefined") return createDemoWorkspace();
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    const seed = createDemoWorkspace();
    saveDemoWorkspace(seed);
    return seed;
  }

  try {
    return JSON.parse(stored) as WorkspaceData;
  } catch {
    const seed = createDemoWorkspace();
    saveDemoWorkspace(seed);
    return seed;
  }
}

export function saveDemoWorkspace(data: WorkspaceData) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function newDemoId(prefix: string) {
  return makeId(prefix);
}

function getTodayInputValueFromDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
