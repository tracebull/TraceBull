export interface BulkAddMembersResult {
  userId: string;
  email: string;
  status: string;
}

export interface BulkAddMembersResponse {
  results: BulkAddMembersResult[];
}
