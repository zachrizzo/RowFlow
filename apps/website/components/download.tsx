"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Download, CheckCircle2, Apple, ArrowRight } from "lucide-react"
import Link from "next/link"

export function DownloadSection() {
  const githubReleasesUrl = "https://github.com/zachrizzo/RowFlow/releases/latest"
  
  return (
    <section id="download" className="relative overflow-hidden py-32">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-4xl">
          <div className="mb-16 text-center">
            <div className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
              Download
            </div>
            <h2 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              Get RowFlow Today
            </h2>
            <p className="text-xl text-muted-foreground">
              Start exploring your PostgreSQL databases with a beautiful, modern interface.
            </p>
          </div>
          
          <Card className="group relative overflow-hidden border-2 border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-2xl transition-all duration-300 hover:border-primary/50 hover:shadow-primary/20">
            {/* Decorative gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            
            <CardHeader className="relative z-10 pb-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 shadow-lg">
                  <Apple className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-3xl mb-1">macOS</CardTitle>
                  <CardDescription className="text-base">
                    Download for Mac (Apple Silicon & Intel)
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="relative z-10 space-y-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between rounded-lg border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="text-sm px-3 py-1">
                      Latest Version
                    </Badge>
                    <span className="text-lg font-semibold text-foreground">v0.1.0</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    macOS 10.15+ (Catalina or later) • Universal Binary
                  </p>
                </div>
                <Button 
                  asChild 
                  size="lg" 
                  className="group relative h-14 text-lg px-8 shadow-lg transition-all hover:scale-105 hover:shadow-xl"
                >
                  <Link 
                    href={githubReleasesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="mr-2 h-5 w-5 transition-transform group-hover:translate-y-0.5" />
                    Download .dmg
                    <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
              </div>
              
              <div className="rounded-xl border bg-muted/50 p-6 backdrop-blur-sm">
                <h3 className="mb-4 text-lg font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  System Requirements
                </h3>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {[
                    "macOS 10.15 (Catalina) or later",
                    "Apple Silicon (M1/M2/M3) or Intel processor",
                    "~25 MB disk space",
                    "PostgreSQL database access (local or remote)",
                  ].map((req, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                      <span className="text-sm text-muted-foreground">{req}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="pt-6 border-t border-border/50">
                <p className="mb-4 text-sm font-medium text-muted-foreground">
                  Looking for other platforms or have questions?
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button asChild variant="outline" size="sm" className="transition-all hover:scale-105">
                    <Link 
                      href="https://github.com/zachrizzo/RowFlow/releases"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View All Releases
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="transition-all hover:scale-105">
                    <Link 
                      href="https://github.com/zachrizzo/RowFlow/issues"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Request Platform
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}
