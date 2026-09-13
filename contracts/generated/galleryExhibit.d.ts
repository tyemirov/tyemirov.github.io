// Generated from contracts/*.schema.json. Do not edit.

export interface GalleryExhibit {
  id: string;
  title: string;
  subtitle: string;
  introduction: string;
  startDate: string;
  endDate: string;
  coverArtworkId: string;
  /**
   * @minItems 2
   * @maxItems 2
   */
  coverPosition: never[];
  /**
   * @minItems 1
   * @maxItems 10000
   */
  sections: [
    {
      id: string;
      title: string;
      /**
       * @minItems 1
       * @maxItems 10000
       */
      artworkIds: [string, ...string[]];
    },
    ...{
      id: string;
      title: string;
      /**
       * @minItems 1
       * @maxItems 10000
       */
      artworkIds: [string, ...string[]];
    }[]
  ];
}
