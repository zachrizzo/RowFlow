import type { Metadata } from "next"
import { Inter } from "next/font/google"
import Script from "next/script"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "RowFlow - Modern PostgreSQL Database Viewer",
  description: "A modern, beautiful PostgreSQL database viewer with Model Context Protocol (MCP) support. Built with Tauri, React, and TypeScript. Lightweight, keyboard-first, and AI-ready.",
  keywords: [
    "PostgreSQL",
    "database viewer",
    "database management",
    "MCP",
    "Model Context Protocol",
    "Tauri",
    "React",
    "database tool",
    "SQL editor",
    "schema browser",
  ],
  authors: [{ name: "RowFlow Team" }],
  creator: "RowFlow",
  publisher: "RowFlow",
  metadataBase: new URL("https://rowflow.app"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://rowflow.app",
    title: "RowFlow - Modern PostgreSQL Database Viewer",
    description: "A modern, beautiful PostgreSQL database viewer with Model Context Protocol (MCP) support. Lightweight, keyboard-first, and AI-ready.",
    siteName: "RowFlow",
  },
  twitter: {
    card: "summary_large_image",
    title: "RowFlow - Modern PostgreSQL Database Viewer",
    description: "A modern, beautiful PostgreSQL database viewer with Model Context Protocol (MCP) support.",
    creator: "@rowflow",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
}

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "RowFlow",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "macOS",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  description: "A modern, beautiful PostgreSQL database viewer with Model Context Protocol (MCP) support.",
  url: "https://rowflow.app",
  downloadUrl: "https://github.com/zachrizzo/RowFlow/releases/latest",
  softwareVersion: "0.1.0",
  author: {
    "@type": "Organization",
    name: "RowFlow",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <Script
          id="structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
        />
        {children}
      </body>
    </html>
  )
}
