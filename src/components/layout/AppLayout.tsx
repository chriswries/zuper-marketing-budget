import { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { CloudDataRealtimeManager } from "@/components/realtime/CloudDataRealtimeManager";

interface AppLayoutProps {
  children?: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <CloudDataRealtimeManager />
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        {/* Allow normal vertical scrolling in the right panel, but prevent page-level horizontal panning */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 md:p-6">
          {children ?? <Outlet />}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

