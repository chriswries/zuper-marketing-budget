import { 
  DollarSign, 
  TrendingUp, 
  Receipt, 
  FileText, 
  BarChart3, 
  CheckSquare, 
  Upload, 
  Settings 
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRequests } from "@/contexts/RequestsContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

const navItems = [
  { title: "Budget", url: "/budget", icon: DollarSign, adminOnly: false },
  { title: "Forecast", url: "/forecast", icon: TrendingUp, adminOnly: false },
  { title: "Actuals", url: "/actuals", icon: Receipt, adminOnly: false },
  { title: "Requests", url: "/requests", icon: FileText, adminOnly: false },
  { title: "Reports", url: "/reports", icon: BarChart3, adminOnly: false },
  { title: "Tasks", url: "/tasks", icon: CheckSquare, adminOnly: false },
  { title: "Import Actuals", url: "/import", icon: Upload, adminOnly: false },
  { title: "Admin", url: "/admin", icon: Settings, adminOnly: true },
];

export function AppSidebar() {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();
  const { requests } = useRequests();
  const { role } = useAuth();

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const isActive = (path: string) => location.pathname === path;
  const isAdmin = role === 'admin';

  const handleDisabledClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toast({
      title: "Access restricted",
      description: "You don't have access to Admin.",
      variant: "destructive",
    });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <DollarSign className="h-4 w-4" />
          </div>
          <span className="font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            Budget
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isDisabled = item.adminOnly && !isAdmin;

                if (isDisabled) {
                  // Render disabled Admin item with tooltip
                  return (
                    <SidebarMenuItem key={item.title}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            onClick={handleDisabledClick}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md cursor-not-allowed opacity-50"
                          >
                            <item.icon className="h-4 w-4" />
                            <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          Admin access required
                        </TooltipContent>
                      </Tooltip>
                    </SidebarMenuItem>
                  );
                }

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                    >
                      <NavLink
                        to={item.url}
                        onClick={() => setOpenMobile(false)}
                        className="flex items-center gap-2 w-full"
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        {item.url === "/requests" && pendingCount > 0 && (
                          <Badge variant="secondary" className="ml-auto text-xs px-1.5 py-0 h-5 min-w-5 flex items-center justify-center">
                            {pendingCount}
                          </Badge>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
