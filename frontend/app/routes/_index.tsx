import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { useLoaderData, Link } from '@remix-run/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Activity, Database, Zap, FileText, ExternalLink } from 'lucide-react';

export async function loader({ context }: LoaderFunctionArgs) {
  // In production, this would fetch from D1
  // For now, return mock data
  return json({
    stats: {
      totalRequests: 1247,
      activeProjects: 8,
      aiGenerations: 342,
      gmailThreadsProcessed: 1829,
    },
    recentProjects: [
      {
        id: '1',
        name: 'Email Automation Script',
        appsscriptId: 'abc123',
        editorUrl: 'https://script.google.com/home/projects/abc123/edit',
        lastSeen: '2025-12-23T10:30:00Z',
        requestCount: 423,
      },
      {
        id: '2',
        name: 'Document Processor',
        appsscriptId: 'def456',
        editorUrl: 'https://script.google.com/home/projects/def456/edit',
        lastSeen: '2025-12-23T09:15:00Z',
        requestCount: 287,
      },
      {
        id: '3',
        name: 'Gmail Analytics',
        appsscriptId: 'ghi789',
        editorUrl: 'https://script.google.com/home/projects/ghi789/edit',
        lastSeen: '2025-12-22T18:45:00Z',
        requestCount: 156,
      },
    ],
  });
}

export default function Index() {
  const { stats, recentProjects } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Colby-GAS-Bridge</h1>
              <p className="text-sm text-muted-foreground">
                Cloudflare Worker utilities for Google Apps Script
              </p>
            </div>
            <nav className="flex gap-4">
              <Link to="/telemetry">
                <Button variant="ghost">
                  <Activity className="w-4 h-4 mr-2" />
                  Telemetry
                </Button>
              </Link>
              <Link to="/prompts">
                <Button variant="ghost">
                  <FileText className="w-4 h-4 mr-2" />
                  Prompts
                </Button>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
              <Activity className="h-4 w-4 text-chart-1" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-chart-1">{stats.totalRequests.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">All-time API calls</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
              <Database className="h-4 w-4 text-chart-2" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-chart-2">{stats.activeProjects}</div>
              <p className="text-xs text-muted-foreground">Apps Script projects</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">AI Generations</CardTitle>
              <Zap className="h-4 w-4 text-chart-3" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-chart-3">{stats.aiGenerations.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Llama model calls</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gmail Threads</CardTitle>
              <BarChart className="h-4 w-4 text-chart-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-chart-4">{stats.gmailThreadsProcessed.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Processed & indexed</p>
            </CardContent>
          </Card>
        </div>

        {/* Project Ledger */}
        <Card>
          <CardHeader>
            <CardTitle>Active Apps Script Projects</CardTitle>
            <CardDescription>
              Projects that have recently called this Worker, ordered by last seen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors"
                >
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{project.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      ID: {project.appsscriptId}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Last seen: {new Date(project.lastSeen).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-lg font-bold text-chart-1">{project.requestCount}</div>
                      <div className="text-xs text-muted-foreground">requests</div>
                    </div>
                    <a
                      href={project.editorUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-4"
                    >
                      <Button variant="outline" size="sm">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Open in Editor
                      </Button>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Features Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-chart-3" />
                AI Services
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Llama 3.3, Vision, and Scout models with full transcript logging
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-chart-2" />
                Gmail Metadata
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Deduplication and RAG for email processing with Vectorize
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-chart-5" />
                Doc Controller
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Markdown-to-Doc conversion with natural language editing
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Colby-GAS-Bridge v1.0.0</p>
          <p className="mt-2">
            <a href="/doc" className="text-primary hover:underline">
              API Documentation
            </a>
            {' · '}
            <a href="/health" className="text-primary hover:underline">
              Health Check
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
