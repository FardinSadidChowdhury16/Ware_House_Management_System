import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../../core/api/queryKeys.js";
import { stockOutApi } from "../api/stockOutApi.js";

export function useStockOut(params = {}) {
  const queryClient = useQueryClient();

  const {
    data: movementsData,
    isLoading: isLoadingMovements,
    isFetching: isFetchingMovements,
    refetch: refetchMovements,
  } = useQuery({
    queryKey: ["inventory", "movements", "out", params],
    queryFn: () => stockOutApi.listMovements(params),
    staleTime: 0,
    refetchInterval: 4000, // Auto-update movements table every 4 seconds!
    refetchOnWindowFocus: true,
  });

  const { data: warehouses, isLoading: isLoadingWarehouses } = useQuery({
    queryKey: queryKeys.warehouses.list,
    queryFn: () => stockOutApi.listWarehouses(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: customers, isLoading: isLoadingCustomers } = useQuery({
    queryKey: queryKeys.parties.customers,
    queryFn: () => stockOutApi.listCustomers(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: products, isLoading: isLoadingProducts } = useQuery({
    queryKey: ["products", "summary"],
    queryFn: () => stockOutApi.listProductsSummary(),
    staleTime: 5 * 60 * 1000,
  });

  const createStockOutMutation = useMutation({
    mutationFn: (payload) => stockOutApi.createStockOut(payload),
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
    warehouses: warehouses || [],
    isLoadingWarehouses,
    customers: customers || [],
    isLoadingCustomers,
    products: products || [],
    isLoadingProducts,
    createStockOut: createStockOutMutation.mutateAsync,
    isCreating: createStockOutMutation.isPending,
  };
}
