import { Button } from "@/components/ui/button"
import { Database, Download, Github, Sparkles } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b bg-gradient-to-b from-background via-background to-muted/20">
      {/* Background decoration */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute right-1/4 top-1/4 h-[300px] w-[300px] rounded-full bg-primary/10 blur-3xl" />
      </div>
      
      <div className="container mx-auto px-4 py-32 md:py-40 lg:py-48">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            {/* Left side - Text content */}
            <div className="text-center lg:text-left">
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border bg-muted/80 backdrop-blur-sm px-4 py-2 text-sm shadow-sm transition-all hover:bg-muted/90">
                <Database className="h-4 w-4 text-primary" />
                <span className="font-medium">Modern PostgreSQL Database Viewer</span>
                <Sparkles className="h-3 w-3 text-primary" />
              </div>
              
              <h1 className="mb-6 text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
                Beautiful PostgreSQL
                <br />
                <span className="bg-gradient-to-r from-primary via-primary/90 to-primary/80 bg-clip-text text-transparent">
                  Database Viewer
                </span>
              </h1>
              
              <p className="mb-12 text-xl text-muted-foreground sm:text-2xl md:text-3xl leading-relaxed">
                A modern, keyboard-first PostgreSQL database viewer with{" "}
                <span className="font-semibold text-foreground">Model Context Protocol</span> support.
                <br />
                Built with Tauri for native performance and a beautiful dark theme.
              </p>
              
              <div className="mb-8 flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start">
                <Button 
                  asChild 
                  size="lg" 
                  className="group relative h-14 text-lg px-8 py-6 shadow-lg transition-all hover:scale-105 hover:shadow-xl"
                >
                  <Link href="#download">
                    <Download className="mr-2 h-5 w-5 transition-transform group-hover:translate-y-0.5" />
                    Download for Mac
                  </Link>
                </Button>
                <Button 
                  asChild 
                  variant="outline" 
                  size="lg" 
                  className="h-14 text-lg px-8 py-6 border-2 transition-all hover:scale-105 hover:bg-muted/50"
                >
                  <Link 
                    href="https://github.com/zachrizzo/RowFlow" 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <Github className="mr-2 h-5 w-5" />
                    View on GitHub
                  </Link>
                </Button>
              </div>
              
              <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground lg:justify-start">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="font-medium">Lightweight</span>
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="font-medium">Fast</span>
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
                  <span className="font-medium">Secure</span>
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                  <span className="font-medium">AI-Ready</span>
                </div>
              </div>
            </div>
            
            {/* Right side - Screenshot */}
            <div className="relative">
              <div className="relative overflow-hidden rounded-2xl border-2 border-border/50 bg-card shadow-2xl transition-all hover:border-primary/50 hover:shadow-primary/20">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 opacity-0 transition-opacity duration-300 hover:opacity-100" />
                <Image
                  src="/images/screenshots/schema-browser-tree-view.png"
                  alt="RowFlow application showing Schema Browser and Table Preview"
                  width={1200}
                  height={800}
                  className="w-full h-auto"
                  priority
                  quality={90}
                />
              </div>
              {/* Decorative elements */}
              <div className="absolute -bottom-4 -left-4 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
              <div className="absolute -top-4 -right-4 h-32 w-32 rounded-full bg-primary/5 blur-2xl" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
