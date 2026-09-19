export interface Drill {
  id: string;
  name: string;
  seconds: number;
  kind: "drill" | "rest";
}
export type Menu = Drill[];
