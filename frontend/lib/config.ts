export const config = {
  backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001",
  brandName: process.env.NEXT_PUBLIC_BRAND_NAME ?? "SwiftBrokers",
  assistantName: process.env.NEXT_PUBLIC_ASSISTANT_NAME ?? "Nomi",
  defaultCountryCode: process.env.NEXT_PUBLIC_DEFAULT_COUNTRY_CODE ?? "+961",
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "",
};
