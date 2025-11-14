import Link from "next/link"
import { Github } from "lucide-react"
import { Separator } from "@/components/ui/separator"

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-16">
        <div className="grid gap-12 md:grid-cols-3">
          <div>
            <h3 className="mb-4 text-xl font-bold">RowFlow</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              A modern, beautiful PostgreSQL database viewer with Model Context Protocol support.
              Built for developers who value performance, security, and beautiful design.
            </p>
          </div>
          
          <div>
            <h3 className="mb-4 text-lg font-semibold">Resources</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link 
                  href="https://github.com/zachrizzo/RowFlow" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  GitHub Repository
                </Link>
              </li>
              <li>
                <Link 
                  href="https://github.com/zachrizzo/RowFlow/releases" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  Releases
                </Link>
              </li>
              <li>
                <Link 
                  href="https://github.com/zachrizzo/RowFlow/issues" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  Issues & Support
                </Link>
              </li>
            </ul>
          </div>
          
          <div>
            <h3 className="mb-4 text-lg font-semibold">Connect</h3>
            <div className="flex items-center gap-4">
              <Link 
                href="https://github.com/zachrizzo/RowFlow" 
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-all hover:scale-110 hover:border-primary hover:text-primary"
              >
                <Github className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
        
        <Separator className="my-12" />
        
        <div className="flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
          <p>© {new Date().getFullYear()} RowFlow. Open source software.</p>
          <p className="flex items-center gap-1">
            Built with
            <span className="mx-1 text-primary">❤️</span>
            using Tauri, React, and TypeScript
          </p>
        </div>
      </div>
    </footer>
  )
}
