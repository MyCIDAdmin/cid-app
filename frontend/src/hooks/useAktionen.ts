import { useQuery } from "@tanstack/react-query";

import * as aktionenApi from "../api/aktionen";

export function useAktionOeffentlich(id: string | undefined) {
  return useQuery({
    queryKey: ["aktionen", "oeffentlich", id],
    queryFn: () => aktionenApi.getAktionOeffentlich(id as string),
    enabled: Boolean(id),
    retry: false,
  });
}
