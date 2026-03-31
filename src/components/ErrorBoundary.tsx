import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertTriangle, ChevronDown } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <CardTitle>Something went wrong</CardTitle>
            </div>
            <CardDescription>
              An unexpected error occurred. You can reload the page to try again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>
                {this.state.error?.message || 'Unknown error'}
              </AlertDescription>
            </Alert>
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                  <ChevronDown className="h-4 w-4" />
                  Error details
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                  {this.state.error?.stack}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
          <CardFooter>
            <Button onClick={() => window.location.reload()}>Reload Page</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
}
