export interface DomainFeedItem {
  name: string;
  source: string;
  auctionUrl?: string;
  auctionEndAt?: Date;
  currentBid?: number;
  bidCount?: number;
  backlinks?: number;
}
