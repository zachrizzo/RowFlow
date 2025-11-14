import {
  Database,
  Search,
  Code,
  Table,
  Command,
  Brain,
  Sparkles,
  Keyboard,
  Shield,
  Zap,
  Layers,
  GitBranch,
  Settings,
  Lock,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Image from "next/image"

const featuredFeatures = [
  {
    icon: Database,
    title: "Connection Management",
    description: "Create, edit, and manage multiple PostgreSQL connections with secure credential storage and TLS/SSL support. Connect to your databases effortlessly with a beautiful, intuitive form interface.",
    gradient: "from-blue-500/20 to-cyan-500/20",
    image: "/images/screenshots/connection-form.png",
    imageAlt: "New Connection form showing connection settings and security options",
  },
  {
    icon: Layers,
    title: "Schema Browser",
    description: "Hierarchical tree view of schemas, tables, views, and columns with smooth animations and powerful search. Navigate your database structure effortlessly.",
    gradient: "from-purple-500/20 to-pink-500/20",
    image: "/images/screenshots/schema-browser-tree-view.png",
    imageAlt: "Schema Browser showing hierarchical tree view of database schemas and tables",
  },
  {
    icon: Code,
    title: "Query Editor",
    description: "Monaco Editor with PostgreSQL syntax highlighting, auto-completion, and multi-cursor support. Write and execute queries with ease.",
    gradient: "from-green-500/20 to-emerald-500/20",
    image: "/images/screenshots/query-editor.png",
    imageAlt: "Query Editor with SQL syntax highlighting and results display",
  },
  {
    icon: Sparkles,
    title: "Generate Test Data",
    description: "Use the built-in AI Test Data Generator to draft up to 25 rows per request, supply optional templates or guidance, and automatically respect primary and unique key constraints so inserts succeed on the first try.",
    gradient: "from-amber-500/20 to-pink-500/20",
    image: "/images/screenshots/generate-test-data.png",
    imageAlt: "Generate Test Data dialog showing AI options and unique column badges",
  },
  {
    icon: Table,
    title: "Results Grid & Editing",
    description: "Virtualized table that handles 100k+ rows smoothly. Edit data inline, view JSON sidebars, and export results with ease.",
    gradient: "from-orange-500/20 to-red-500/20",
    image: "/images/screenshots/results-grid-editing.png",
    imageAlt: "Table preview with inline editing capabilities and JSON sidebar",
  },
  {
    icon: GitBranch,
    title: "Schema Relationships",
    description: "Visualize database relationships with interactive graph and detailed views showing foreign keys and table connections. Understand your data structure at a glance.",
    gradient: "from-violet-500/20 to-purple-500/20",
    image: "/images/screenshots/schema-relationships-graph-view.png",
    imageAlt: "Graph view showing database schema relationships and foreign key connections",
  },
  {
    icon: Brain,
    title: "AI Chat & Embeddings",
    description: "Local embedding pipeline with Ollama for semantic search over database tables. Ask questions in natural language and get intelligent answers about your data.",
    gradient: "from-pink-500/20 to-rose-500/20",
    image: "/images/screenshots/ai-chat.png",
    imageAlt: "AI Chat interface with semantic search capabilities for database queries",
  },
  {
    icon: Lock,
    title: "Fully Local & Private",
    description: "Everything runs locally on your machine. Your data never leaves your computer—database connections, queries, results, and even AI processing with Ollama all stay completely private and secure.",
    gradient: "from-green-500/20 to-emerald-500/20",
    image: "/images/screenshots/ai-chat.png",
    imageAlt: "Fully local AI chat processing keeping all data private",
  },
]

const otherFeatures = [
  {
    icon: Command,
    title: "Command Palette",
    description: "Keyboard-first navigation with 25+ commands accessible via ⌘K. Fuzzy search and recent commands.",
    gradient: "from-indigo-500/20 to-blue-500/20",
  },
  {
    icon: GitBranch,
    title: "MCP Server Integration",
    description: "Built-in Model Context Protocol server for Claude Desktop integration and AI-powered database queries.",
    gradient: "from-violet-500/20 to-purple-500/20",
    image: "/images/screenshots/mcp-server.png",
    imageAlt: "MCP Server configuration and status",
  },
  {
    icon: Settings,
    title: "AI Model Management",
    description: "Manage Ollama models directly from the app. Install, configure, and monitor AI models for embeddings and chat.",
    gradient: "from-pink-500/20 to-rose-500/20",
    image: "/images/screenshots/ai-models.png",
    imageAlt: "AI Models settings showing Ollama service and installed models",
  },
  {
    icon: Keyboard,
    title: "Keyboard-First Design",
    description: "Every action accessible via keyboard shortcuts. Optimized for power users and efficient workflows.",
    gradient: "from-cyan-500/20 to-blue-500/20",
  },
  {
    icon: Shield,
    title: "Secure & Read-Only",
    description: "Read-only mode, TLS/SSL support, and secure credential storage. Perfect for production databases.",
    gradient: "from-green-500/20 to-teal-500/20",
  },
  {
    icon: Zap,
    title: "Lightweight & Fast",
    description: "Built with Tauri for native performance. Small bundle size (~25 MB) and fast startup times.",
    gradient: "from-yellow-500/20 to-orange-500/20",
  },
  {
    icon: Search,
    title: "Powerful Search",
    description: "Debounced search across schemas, tables, and columns. Filter by type and auto-expand matches.",
    gradient: "from-blue-500/20 to-indigo-500/20",
  },
  {
    icon: Sparkles,
    title: "Beautiful UI",
    description: "Modern dark theme with smooth animations, consistent design, and excellent user experience.",
    gradient: "from-purple-500/20 to-pink-500/20",
  },
]

export function Features() {
  return (
    <section id="features" className="relative overflow-hidden bg-muted/30 py-32">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center mb-20">
          <div className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            Features
          </div>
          <h2 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Powerful Features
          </h2>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Everything you need to explore and manage your PostgreSQL databases efficiently.
          </p>
        </div>
        
        {/* Featured Features - Large Cards with Images */}
        <div className="mb-24 space-y-16">
          {featuredFeatures.map((feature, index) => {
            const Icon = feature.icon
            const isEven = index % 2 === 0
            return (
              <div
                key={feature.title}
                className={`grid gap-12 lg:grid-cols-2 lg:items-center ${
                  !isEven ? "lg:grid-flow-dense" : ""
                }`}
              >
                <div className={`${!isEven ? "lg:col-start-2" : ""}`}>
                  <div className="mb-6 inline-flex items-center gap-3">
                    <div className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.gradient} shadow-lg`}>
                      <Icon className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <div className="mb-1 text-sm font-medium text-primary">Featured</div>
                      <h3 className="text-3xl font-bold sm:text-4xl">{feature.title}</h3>
                    </div>
                  </div>
                  <p className="text-lg leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
                <div className={`relative ${!isEven ? "lg:col-start-1 lg:row-start-1" : ""}`}>
                  <div className="relative overflow-hidden rounded-2xl border-2 border-border/50 bg-card shadow-2xl transition-all hover:border-primary/50 hover:shadow-primary/20">
                    <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 transition-opacity duration-300 hover:opacity-10`} />
                    <Image
                      src={feature.image}
                      alt={feature.imageAlt || feature.title}
                      width={1200}
                      height={800}
                      className="w-full h-auto"
                      quality={90}
                    />
                  </div>
                  {/* Decorative elements */}
                  <div className="absolute -bottom-4 -left-4 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
                  <div className="absolute -top-4 -right-4 h-32 w-32 rounded-full bg-primary/5 blur-2xl" />
                </div>
              </div>
            )
          })}
        </div>
        
        {/* Other Features - Grid */}
        <div>
          <div className="mb-12 text-center">
            <h3 className="text-2xl font-bold mb-2">And More</h3>
            <p className="text-muted-foreground">Additional powerful features to enhance your workflow</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {otherFeatures.map((feature) => {
              const Icon = feature.icon
              return (
                <Card 
                  key={feature.title} 
                  className="group relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
                  <CardHeader className="relative z-10">
                    <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${feature.gradient} shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}>
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl mb-2 group-hover:text-primary transition-colors">
                      {feature.title}
                    </CardTitle>
                    <CardDescription className="text-base leading-relaxed">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                  {feature.image && (
                    <CardContent className="relative z-10 pt-0">
                      <div className="relative h-48 w-full overflow-hidden rounded-lg border border-border/50 bg-muted/50 group-hover:border-primary/50 transition-all duration-300">
                        <Image
                          src={feature.image}
                          alt={feature.imageAlt || feature.title}
                          fill
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        />
                      </div>
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
