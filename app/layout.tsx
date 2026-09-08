import type { Metadata } from "next";
import { Manrope, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
const sans = Manrope({ variable:"--font-body",subsets:["latin"] });
const mono = IBM_Plex_Mono({variable:"--font-data",subsets:["latin"],weight:["400","500","600"]});
export const metadata: Metadata = {title:"Elo · Estoque conectado", description:"Converse com o agente para consultar latas, granel e totais em kg nas suas lojas."};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="pt-BR"><body className={sans.variable+" "+mono.variable}>{children}</body></html>;}
