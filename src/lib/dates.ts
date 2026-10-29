export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const diffDays = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
export const todayISO = () => iso(new Date());
export const nice = (s: string) => { const d = parse(s); return `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`; };
export const short = (s: string) => { const d = parse(s); return `${MON[d.getMonth()]} ${d.getDate()}`; };
export const hrs = (m: number) => `${+(m / 60).toFixed(2)}h`;
export const fmtMin = (m: number) => m >= 60 ? (m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`) : `${m} min`;
export const relDays = (dd: number) => dd === 0 ? "Today" : dd === 1 ? "Tomorrow" : dd < 0 ? `${-dd} day${dd === -1 ? "" : "s"} ago` : `In ${dd} days`;
export const mondayOf = (s: string) => addDays(s, -((parse(s).getDay() + 6) % 7));
