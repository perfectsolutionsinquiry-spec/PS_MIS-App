// Shared shapes for what the API sends back. The frontend never computes or
// decides anything from these — it only displays exactly what arrives. See
// the note at the top of App.tsx.

export type Identity =
  | { kind: "staff"; staffId: string; fullName: string | null; role: string }
  | { kind: "builder"; builderUserId: string; builderId: string; fullName: string | null; role: string };

export type Customer = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  stage: string | null;
  created_at: string;
};
