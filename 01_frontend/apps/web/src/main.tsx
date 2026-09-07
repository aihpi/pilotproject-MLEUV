import React from "react";import{createRoot}from"react-dom/client";import{BrowserRouter,HashRouter}from"react-router-dom";import{QueryClient,QueryClientProvider}from"@tanstack/react-query";
import "@kern-ux/native/dist/kern.min.css";import "@kern-ux/native/dist/fonts/fira-sans.css";import "./styles.css";import{App}from"./App";
const queryClient=new QueryClient({defaultOptions:{queries:{staleTime:10_000,retry:1}}});
const Router=import.meta.env.VITE_STATIC==="true"?HashRouter:BrowserRouter;
createRoot(document.getElementById("root")!).render(<React.StrictMode><QueryClientProvider client={queryClient}><Router><App/></Router></QueryClientProvider></React.StrictMode>);
