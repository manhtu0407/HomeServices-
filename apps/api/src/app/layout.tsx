import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NestScout",
  description: "Nền tảng dịch vụ sửa điện, sửa nước tại HCMC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
