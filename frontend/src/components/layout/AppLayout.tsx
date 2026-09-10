import { Outlet } from "react-router-dom";

import Sidebar from "./Sidebar";

export default function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-bg-tertiary p-6">
        <Outlet />
      </main>
    </div>
  );
}
