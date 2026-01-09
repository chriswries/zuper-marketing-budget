import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, BarChart3, Flame, Trophy, Target } from "lucide-react";

export default function Reports() {
  const navigate = useNavigate();
  
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="View dashboards and analytics for budget performance, variances, and spending trends."
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Budget vs Forecast Variance - Available */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Budget vs Forecast Variance</CardTitle>
            </div>
            <CardDescription>
              Compare approved budget against current forecast to identify variances by cost center and line item.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button onClick={() => navigate('/reports/variance')} className="w-full">
              View Report
            </Button>
          </CardContent>
        </Card>

        {/* Forecast vs Actuals Variance - Available */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Forecast vs Actuals Variance</CardTitle>
            </div>
            <CardDescription>
              Compare current forecast against matched actuals to identify variances by cost center and line item.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button onClick={() => navigate('/reports/forecast-actuals-variance')} className="w-full">
              View Report
            </Button>
          </CardContent>
        </Card>

        {/* Burn Rate / Runway - Available */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Burn Rate / Runway</CardTitle>
            </div>
            <CardDescription>
              Track spending velocity and forecast when budget will be exhausted.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button onClick={() => navigate('/reports/burn-rate')} className="w-full">
              View Report
            </Button>
          </CardContent>
        </Card>

        {/* Coming Soon Cards */}

        <Card className="flex flex-col opacity-60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Cost Center Leaderboard</CardTitle>
            </div>
            <CardDescription>
              Rank cost centers by spend, variance, and efficiency metrics.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button disabled variant="outline" className="w-full">
              Coming Soon
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col opacity-60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Forecast Accuracy</CardTitle>
            </div>
            <CardDescription>
              Measure how accurately forecasts predict actual spending over time.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button disabled variant="outline" className="w-full">
              Coming Soon
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
