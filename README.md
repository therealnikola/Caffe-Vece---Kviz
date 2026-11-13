Real-Time Multi-Tenant Quiz Platform (SaaS)

Platforma za kvizove u realnom vremenu sa više lokacija (Multi-Location/SaaS), namenjena kafićima, pabovima i mestima za zabavu uživo. 
Aplikacija poseduje arhitekturu koja omogućava da više nezavisnih kvizova radi istovremeno na istoj instalaciji, potpuno odvojeno bez mešanja podataka. 

🚀 Ključne Karakteristike

•	Multi-Tenant Arhitektura: Podaci su podijeljeni po locationId identifikatoru, što omogućava izolovane kvizove za različite lokale unutar jednog sistema. 

•	Sinhronizacija u Realnom Vremenu: Pokreće se preko Firebase Realtime Database za trenutne promene stanja, rang-listu uživo i sinhronizovan prikaz pitanja na svim uređajima. 

•	Upravljanje Ulogama (Role-Based Access): Namenski prikazi za Master Admina (globalna kontrola), Admina lokala (upravljanje kvizom na licu mesta) i Kapetane timova/igrače. 

•	Stabilne Sesije Timova: Podržava prijavu sa više uređaja po jednom timu uz rezervni mehanizam (failover) kako igra ne bi stala čak i ako kapiten izgubi internet vezu.

•	Sistem Upravljanja Zvukom: Integrisani zvučni efekti za tajmere, pauze i uspeh, uz strogu kontrolu sprečavanja preklapanja zvuka.

🛠️ Tehnologije

•	Frontend: React (Vite), Tailwind CSS

•	Baza Podataka: Firebase Realtime Database

•	Lokalna AI Integracija: Razvijeno i refaktorisano lokalno uz pomoć Ollama (Qwen2.5-Coder) i Continue.dev alata
