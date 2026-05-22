export type ReservationStatus = "confirmed" | "completed" | "canceled" | "no_show";
export type PaymentStatus = "unpaid" | "pending" | "paid" | "refunded";
export type ReminderStatus = "pending" | "sent" | "skipped";
export type NotificationStatus = "pending" | "sent" | "failed" | "disabled";

export type Store = {
  id: string;
  owner_id?: string | null;
  name: string;
  slug: string;
  address: string;
  region?: string;
  city?: string;
  description?: string;
  hero_image_url?: string;
  timezone: string;
  cancellation_hours: number;
  line_enabled: boolean;
  reminder_enabled: boolean;
  google_calendar_enabled: boolean;
  public_booking_enabled: boolean;
  created_at?: string;
};

export type StaffMember = {
  id: string;
  store_id: string;
  name: string;
  role: string;
  active: boolean;
  color: string;
};

export type Service = {
  id: string;
  store_id: string;
  name: string;
  category?: string;
  description?: string;
  route?: string;
  highlights?: string[];
  cover_image_url?: string;
  rating?: number;
  review_count?: number;
  max_guests?: number;
  remaining_seats?: number;
  featured?: boolean;
  duration_minutes: number;
  price_cents: number;
  active: boolean;
};

export type Customer = {
  id: string;
  store_id: string;
  name: string;
  email: string;
  phone: string;
  memo: string;
  line_user_id?: string | null;
  created_at?: string;
};

export type Reservation = {
  id: string;
  store_id: string;
  staff_id: string;
  service_id: string;
  customer_id: string;
  starts_at: string;
  ends_at: string;
  status: ReservationStatus;
  memo: string;
  payment_status: PaymentStatus;
  payment_url?: string | null;
  line_notification_status: NotificationStatus;
  reminder_status: ReminderStatus;
  google_event_id?: string | null;
  created_at?: string;
  customer?: Customer;
  service?: Service;
  staff?: StaffMember;
};

export type WorkspaceData = {
  stores: Store[];
  staff: StaffMember[];
  services: Service[];
  customers: Customer[];
  reservations: Reservation[];
};

export type ReservationFormState = {
  storeId: string;
  staffId: string;
  serviceId: string;
  date: string;
  time: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerMemo: string;
  reservationMemo: string;
  status: ReservationStatus;
  paymentStatus: PaymentStatus;
};
