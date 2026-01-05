import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AppHeader() {
  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-background px-4">
      <SidebarTrigger />
      
      <div className="flex flex-1 items-center gap-4">
        <h1 className="text-lg font-semibold text-foreground hidden sm:block">
          Marketing Budget
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <Select defaultValue="fy26">
          <SelectTrigger className="w-[120px] h-8 text-sm">
            <SelectValue placeholder="Fiscal Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fy25">FY25</SelectItem>
            <SelectItem value="fy26">FY26</SelectItem>
            <SelectItem value="fy27">FY27</SelectItem>
          </SelectContent>
        </Select>

        <Badge variant="secondary" className="hidden sm:flex">
          Marketing Admin
        </Badge>
      </div>
    </header>
  );
}
