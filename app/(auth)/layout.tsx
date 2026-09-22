import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main id="main-content" className="grow flex flex-col">
      {children}
    </main>
  );
}
