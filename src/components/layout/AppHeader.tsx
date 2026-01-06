import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFiscalYearBudget } from "@/contexts/FiscalYearBudgetContext";
import { useCurrentUserRole, UserRole } from "@/contexts/CurrentUserRoleContext";

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  cmo: 'CMO',
  finance: 'Finance',
};

const roleBadgeColors: Record<UserRole, string> = {
  admin: 'bg-primary text-primary-foreground',
  manager: 'bg-amber-500 text-white',
  cmo: 'bg-purple-600 text-white',
  finance: 'bg-green-600 text-white',
};

export function AppHeader() {
  const { fiscalYears, selectedFiscalYearId, setSelectedFiscalYearId } = useFiscalYearBudget();
  const { currentRole } = useCurrentUserRole();

  const hasBudgets = fiscalYears.length > 0;

  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-background px-4">
      <SidebarTrigger />
      
      <div className="flex flex-1 items-center gap-4">
        <h1 className="text-lg font-semibold text-foreground hidden sm:block">
          Marketing Budget
        </h1>
      </div>

      <div className="flex items-center gap-3">
        {hasBudgets ? (
          <Select 
            value={selectedFiscalYearId ?? undefined} 
            onValueChange={setSelectedFiscalYearId}
          >
            <SelectTrigger className="w-[120px] h-8 text-sm">
              <SelectValue placeholder="Select FY" />
            </SelectTrigger>
            <SelectContent>
              {fiscalYears.map((fy) => (
                <SelectItem key={fy.id} value={fy.id}>
                  {fy.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm text-muted-foreground">No budgets created</span>
        )}

        <Badge className={`hidden sm:flex ${roleBadgeColors[currentRole]}`}>
          {roleLabels[currentRole]}
        </Badge>
      </div>
    </header>
  );
}
