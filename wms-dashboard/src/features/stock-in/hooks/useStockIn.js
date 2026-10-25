import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../../core/api/queryKeys.js";
import { stockInApi } from "../api/stockInApi.js";

export function useStockIn(params = {}) {
  const queryClient = useQueryClient();

  const { data: movementsData, isLoading: isLoadingMovements, isFetching: isFetchingMovements, refetch: refetchMovements } = useQuery({
    queryKey: queryKeys.inventory.movements(params),
    queryFn: () => stockInApi.listMovements(params),
    staleTime: 0,
    refetchInterval: 4000, // Auto-update movements table every 4 seconds!
    refetchOnWindowFocus: true,
  });

  const { data: stats, isLoading: isLoadingStats, refetch: refetchStats } = useQuery({
    queryKey: queryKeys.inventory.stats,
    queryFn: () => stockInApi.getStats(),
    staleTime: 0,
    refetchInterval: 4000, // Auto-update stats every 4 seconds!
    refetchOnWindowFocus: true,
  });

  const { data: warehouses, isLoading: isLoadingWarehouses } = useQuery({
    queryKey: queryKeys.warehouses.list,
    queryFn: () => stockInApi.listWarehouses(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: suppliers, isLoading: isLoadingSuppliers } = useQuery({
    queryKey: queryKeys.parties.suppliers,
    queryFn: () => stockInApi.listSuppliers(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: products, isLoading: isLoadingProducts } = useQuery({
    queryKey: ["products", "summary"],
    queryFn: () => stockInApi.listProductsSummary(),
    staleTime: 5 * 60 * 1000,
  });

  const createStockInMutation = useMutation({
    mutationFn: (payload) => stockInApi.createStockIn(payload),
    onSuccess: async () => {
      // Invalidate and immediately refetch both inventory and approvals
      await queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.approvals.all });
      await queryClient.refetchQueries({ queryKey: queryKeys.inventory.all });
      await queryClient.refetchQueries({ queryKey: queryKeys.approvals.all });
    },
  });

  return {
    movements: movementsData?.items || movementsData?.data || [],
    totalMovements: movementsData?.total ?? 0,
    totalMovementsPages: movementsData?.total_pages || 1,
    isLoadingMovements,
    isFetchingMovements,
    refetchMovements,
    stats,
    isLoadingStats,
    warehouses: warehouses || [],
    isLoadingWarehouses,
    suppliers: suppliers || [],
    isLoadingSuppliers,
    products: products || [],
    isLoadingProducts,
    createStockIn: createStockInMutation.mutateAsync,
    isCreating: createStockInMutation.isPending,
  };
}
