import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BudgetSetupWizard } from "@/components/budget/BudgetSetupWizard";
import { useAdminSettings } from "@/contexts/AdminSettingsContext";
import { useCurrentUserRole, UserRole } from "@/contexts/CurrentUserRoleContext";
import { TIMEZONE_OPTIONS } from "@/lib/dateTime";
import { CalendarPlus, ShieldCheck, UserCog, History, Globe, Upload, Link } from "lucide-react";

const roleLabels: Record<UserRole, string> = {
  admin: 'Marketing Admin',
  manager: 'Manager',
  cmo: 'CMO',
  finance: 'Finance',
};

export default function Admin() {
  const navigate = useNavigate();
  const [wizardOpen, setWizardOpen] = useState(false);
  const { settings, updateSettings } = useAdminSettings();
  const { currentRole, setCurrentRole } = useCurrentUserRole();

  const handleAbsoluteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0) {
      updateSettings({ increaseApprovalAbsoluteUsd: value });
    }
  };

  const handlePercentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0 && value <= 100) {
      updateSettings({ increaseApprovalPercent: value });
    }
  };

  return (
    <div>
      <PageHeader
        title="Admin Settings"
        description="Configure fiscal years, cost centers, vendors, users, and approval workflows."
      />

      <div className="space-y-6">
        {/* User Role Selector (Demo) */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">User Role (Demo)</CardTitle>
            </div>
            <CardDescription>
              Switch roles to test role-gated approval workflows. This simulates different user permissions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Label htmlFor="role-select">Current role</Label>
              <Select value={currentRole} onValueChange={(v) => setCurrentRole(v as UserRole)}>
                <SelectTrigger id="role-select" className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{roleLabels.admin}</SelectItem>
                  <SelectItem value="manager">{roleLabels.manager}</SelectItem>
                  <SelectItem value="cmo">{roleLabels.cmo}</SelectItem>
                  <SelectItem value="finance">{roleLabels.finance}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                <strong>Admin:</strong> Create/edit budgets, submit for approval, reset to draft. Cannot approve.<br />
                <strong>Manager:</strong> Approve manager-level spend requests.<br />
                <strong>CMO:</strong> Approve CMO-level budget and spend request steps.<br />
                <strong>Finance:</strong> Approve Finance-level budget and spend request steps.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-medium text-foreground">Fiscal Year Budgets</h3>
                <p className="text-sm text-muted-foreground">
                  Create and manage fiscal year budgets
                </p>
              </div>
              <Button onClick={() => setWizardOpen(true)}>
                <CalendarPlus className="h-4 w-4 mr-2" />
                Start FY Budget
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Approval Thresholds</CardTitle>
            </div>
            <CardDescription>
              Approval is required when an inline edit increases the FY total by more than
              max($threshold, %threshold of old FY total). Only increases trigger approvals.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="absolute-threshold">Approval threshold ($)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="absolute-threshold"
                    type="number"
                    min={0}
                    step={100}
                    value={settings.increaseApprovalAbsoluteUsd}
                    onChange={handleAbsoluteChange}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Minimum dollar increase that triggers approval
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="percent-threshold">Approval threshold (%)</Label>
                <div className="relative">
                  <Input
                    id="percent-threshold"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={settings.increaseApprovalPercent}
                    onChange={handlePercentChange}
                    className="pr-7"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Percentage of old FY total used as threshold
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
              Example: With ${settings.increaseApprovalAbsoluteUsd.toLocaleString()} and {settings.increaseApprovalPercent}%, 
              a line item with $100,000 FY total would require approval for increases over ${Math.max(settings.increaseApprovalAbsoluteUsd, 100000 * (settings.increaseApprovalPercent / 100)).toLocaleString()}.
            </p>
          </CardContent>
        </Card>

        {/* Timezone Setting */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Timezone</CardTitle>
            </div>
            <CardDescription>
              Set the timezone used for displaying all timestamps across the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="timezone-select">Display timezone</Label>
              <Select 
                value={settings.timeZone} 
                onValueChange={(value) => updateSettings({ timeZone: value })}
              >
                <SelectTrigger id="timezone-select" className="w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                All timestamps in the app will be displayed in this timezone.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Actuals Import */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Actuals Import</CardTitle>
            </div>
            <CardDescription>
              Import bank and Ramp transaction CSVs into a fiscal year.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/admin/actuals')}>
              Import Actuals
            </Button>
          </CardContent>
        </Card>

        {/* Actuals Matching */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Link className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Actuals Matching</CardTitle>
            </div>
            <CardDescription>
              Match imported transactions to cost centers and line items.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/admin/actuals/match')}>
              Match Actuals
            </Button>
          </CardContent>
        </Card>

        {/* Audit Log */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Audit Log</CardTitle>
            </div>
            <CardDescription>
              View approval and notification activity across budgets and requests.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/audit')}>
              Open Audit Log
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">
              Admin settings control the core configuration of your budget system. Manage fiscal years, define cost center structures, maintain vendor lists, and configure approval routing rules.
            </p>
            
            <div className="mt-4">
              <h3 className="font-medium text-foreground mb-2">Coming next:</h3>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Cost center configuration and limits</li>
                <li>Vendor list and alias management</li>
                <li>User and role management</li>
                <li>Approval workflow configuration</li>
                <li>Task/reminder templates</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <BudgetSetupWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}
