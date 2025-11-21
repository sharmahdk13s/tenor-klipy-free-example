/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  FlatList,
  Keyboard,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import FastImage from 'react-native-fast-image';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import {
  TENOR_API_KEY,
  TENOR_CLIENT_KEY,
  TENOR_COUNTRY,
  TENOR_LOCALE,
  TENOR_LIMIT,
  KLIPY_BASE_URL,
  KLIPY_API_KEY,
} from '@env';

type PickerType = 'gif' | 'sticker' | 'clip';
type Provider = 'tenor' | 'klipy';

type TenorMediaFormat = {
  url: string;
  dims?: number[];
  size?: number;
};

type TenorMediaFormats = {
  tinygif?: TenorMediaFormat;
  gif?: TenorMediaFormat;
  mp4?: TenorMediaFormat;
  tinymp4?: TenorMediaFormat;
  [key: string]: TenorMediaFormat | undefined;
};

type TenorResult = {
  id: string;
  title?: string;
  content_description?: string;
  media_formats?: TenorMediaFormats;
};

type TenorResponse = {
  results?: TenorResult[];
  next?: string;
};

type GridItem = {
  id: string;
  url: string;
  width: number;
  height: number;
  isAd?: boolean;
};

type SelectedItem = {
  id: string;
  type: PickerType;
  url: string;
  aspectRatio: number;
};

const INPUT_BAR_HEIGHT = 56;
const KLIPY_AD_FREQUENCY = 8; // insert an ad placeholder after this many Klipy items

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <AppContent />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const [provider, setProvider] = useState<Provider>('tenor');
  const [pickerType, setPickerType] = useState<PickerType>('gif');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<GridItem[]>([]);
  const [selected, setSelected] = useState<SelectedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['25%', '55%', '90%'], []);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {},
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {},
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const fetchPageFromTenor = useCallback(
    async (
      cursor?: string | null,
    ): Promise<{ items: GridItem[]; nextCursor: string | null }> => {
      if (!TENOR_API_KEY) {
        return { items: [], nextCursor: null };
      }

      const trimmedQuery = query.trim();
      const hasQuery = trimmedQuery.length > 0;
      const endpoint = hasQuery
        ? 'https://tenor.googleapis.com/v2/search'
        : 'https://tenor.googleapis.com/v2/featured';

      const params: Record<string, string> = {
        key: TENOR_API_KEY,
        client_key: TENOR_CLIENT_KEY,
        country: TENOR_COUNTRY,
        locale: TENOR_LOCALE,
        contentfilter: 'medium',
        media_filter: 'gif,tinygif,mp4,tinymp4',
        limit: String(TENOR_LIMIT),
      };

      if (hasQuery) {
        params.q = trimmedQuery;
      } else if (pickerType === 'clip') {
        params.q = 'memes';
      }

      if (pickerType === 'sticker') {
        params.searchfilter = 'sticker,-static';
      } else if (pickerType === 'clip') {
        params.ar_range = 'wide';
      }
      if (cursor) {
        params.pos = cursor;
      }

      const queryString = Object.entries(params)
        .filter(([, value]) => value)
        .map(
          ([key, value]) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
        )
        .join('&');

      const url = `${endpoint}?${queryString}`;

      const response = await fetch(url);
      const json = (await response.json()) as TenorResponse;

      const tenorResults = json.results ?? [];
      const mappedItems: GridItem[] = tenorResults
        .map(result => {
          const formats = result.media_formats || {};
          const preview =
            formats.tinygif || formats.gif || formats.tinymp4 || formats.mp4;
          if (!preview || !preview.url) {
            return null;
          }
          const dims = Array.isArray(preview.dims) ? preview.dims : undefined;
          const width = dims && dims.length === 2 && dims[0] > 0 ? dims[0] : 1;
          const height = dims && dims.length === 2 && dims[1] > 0 ? dims[1] : 1;
          return {
            id: result.id,
            url: preview.url,
            width,
            height,
          };
        })
        .filter(Boolean) as GridItem[];

      return {
        items: mappedItems,
        nextCursor: json.next ?? null,
      };
    },
    [pickerType, query],
  );

  const fetchPageFromKlipy = useCallback(
    async (
      _cursor?: string | null,
    ): Promise<{ items: GridItem[]; nextCursor: string | null }> => {
      if (!KLIPY_API_KEY) {
        return { items: [], nextCursor: null };
      }

      const trimmedQuery = query.trim();
      const hasQuery = trimmedQuery.length > 0;
      const perPage = 50;
      const pageNumber = _cursor ? parseInt(_cursor, 10) || 1 : 1;

      let segment: string;
      if (pickerType === 'sticker') {
        segment = hasQuery ? 'stickers/search' : 'stickers/trending';
      } else if (pickerType === 'clip') {
        segment = hasQuery ? 'clips/search' : 'clips/trending';
      } else {
        segment = hasQuery ? 'gifs/search' : 'gifs/trending';
      }

      let url = `${KLIPY_BASE_URL}/${KLIPY_API_KEY}/${segment}`;

      const params: Record<string, string> = {};
      params.page = String(pageNumber);
      params.per_page = String(perPage);
      if (hasQuery) {
        params.q = trimmedQuery;
        params.query = trimmedQuery;
      }

      const queryString = Object.entries(params)
        .filter(([, value]) => value)
        .map(
          ([key, value]) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
        )
        .join('&');

      if (queryString) {
        url += `?${queryString}`;
      }

      const response = await fetch(url);
      const json = (await response.json()) as any;

      let rawItems: any[] = [];
      if (Array.isArray(json)) {
        rawItems = json;
      } else if (json && typeof json === 'object') {
        const topLevelArrays = Object.values(json).filter(value =>
          Array.isArray(value),
        ) as any[][];

        if (topLevelArrays.length > 0) {
          rawItems = topLevelArrays[0];
        } else if (json.data && typeof json.data === 'object') {
          const dataArrays = Object.values(json.data).filter(value =>
            Array.isArray(value),
          ) as any[][];
          if (dataArrays.length > 0) {
            rawItems = dataArrays[0];
          }
        }
      }

      const mappedItems: GridItem[] = rawItems
        .map((item: any) => {
          if (!item) {
            return null;
          }

          if (pickerType === 'clip') {
            const file = (item && item.file) || {};
            const fileMeta = (item && item.file_meta) || {};

            const gifUrl: string | undefined = (file as any).gif;
            const webpUrl: string | undefined = (file as any).webp;
            const mp4Url: string | undefined = (file as any).mp4;

            const mediaUrl: string =
              (gifUrl as string) ||
              (webpUrl as string) ||
              (mp4Url as string) ||
              '';

            if (!mediaUrl) {
              return null;
            }

            const gifMeta = (fileMeta.gif || {}) as {
              width?: number;
              height?: number;
            };
            const webpMeta = (fileMeta.webp || {}) as {
              width?: number;
              height?: number;
            };
            const mp4Meta = (fileMeta.mp4 || {}) as {
              width?: number;
              height?: number;
            };

            const chosenMeta =
              (gifUrl && gifMeta) ||
              (webpUrl && webpMeta) ||
              (mp4Url && mp4Meta) ||
              {};

            const width =
              typeof chosenMeta.width === 'number' && chosenMeta.width > 0
                ? chosenMeta.width
                : 1;

            const height =
              typeof chosenMeta.height === 'number' && chosenMeta.height > 0
                ? chosenMeta.height
                : 1;

            const id: string =
              (typeof item.id === 'string' && item.id) ||
              (typeof item.slug === 'string' && item.slug) ||
              mediaUrl;

            return {
              id,
              url: mediaUrl,
              width,
              height,
            };
          }

          const file = (item && item.file) || {};
          const sizeOrder = ['sm', 'md', 'xs', 'hd'];
          const variantOrder = ['gif', 'webp', 'mp4', 'webm', 'jpg'];

          let mediaUrl = '';
          let width = 1;
          let height = 1;

          for (const sizeKey of sizeOrder) {
            const sizeObj = (file as any)[sizeKey];
            if (!sizeObj || typeof sizeObj !== 'object') {
              continue;
            }

            for (const variantKey of variantOrder) {
              const variant = (sizeObj as any)[variantKey];
              if (variant && typeof variant.url === 'string') {
                mediaUrl = variant.url;
                if (
                  typeof variant.width === 'number' &&
                  typeof variant.height === 'number' &&
                  variant.width > 0 &&
                  variant.height > 0
                ) {
                  width = variant.width;
                  height = variant.height;
                }
                break;
              }
            }

            if (mediaUrl) {
              break;
            }
          }

          if (!mediaUrl) {
            return null;
          }

          const id: string =
            (typeof item.id === 'string' && item.id) ||
            (typeof item.id === 'number' && String(item.id)) ||
            (typeof item.slug === 'string' && item.slug) ||
            mediaUrl;

          return {
            id,
            url: mediaUrl,
            width,
            height,
          };
        })
        .filter(Boolean) as GridItem[];

      return {
        items: mappedItems,
        nextCursor:
          mappedItems.length === perPage ? String(pageNumber + 1) : null,
      };
    },
    [pickerType, query],
  );

  const fetchPage = useCallback(
    async (
      cursor?: string | null,
    ): Promise<{ items: GridItem[]; nextCursor: string | null }> => {
      if (provider === 'tenor') {
        return fetchPageFromTenor(cursor);
      }
      if (provider === 'klipy') {
        return fetchPageFromKlipy(cursor);
      }
      return { items: [], nextCursor: null };
    },
    [fetchPageFromKlipy, fetchPageFromTenor, provider],
  );

  const loadInitial = useCallback(async () => {
    try {
      setLoading(true);
      const page = await fetchPage(null);
      setItems(page.items);
      setNextCursor(page.nextCursor);
    } catch {
      setItems([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial, pickerType, provider]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !nextCursor) {
      return;
    }
    try {
      setLoadingMore(true);
      const page = await fetchPage(nextCursor);
      setItems(previous => [...previous, ...page.items]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, loading, loadingMore, nextCursor]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadInitial();
  }, [loadInitial]);

  const handleSearch = useCallback(() => {
    loadInitial();
  }, [loadInitial]);

  const handleScroll = useCallback(
    (event: any) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);

      if (distanceFromBottom < 400) {
        loadMore();
      }
    },
    [loadMore],
  );

  const displayItems = useMemo(() => {
    if (provider !== 'klipy') {
      return items;
    }

    const result: GridItem[] = [];
    items.forEach((item, index) => {
      result.push(item);
      if ((index + 1) % KLIPY_AD_FREQUENCY === 0) {
        result.push({
          id: `klipy-ad-${index}`,
          url: '',
          width: 1,
          height: 1,
          isAd: true,
        });
      }
    });

    return result;
  }, [items, provider]);

  const masonryColumns = useMemo(() => {
    const left: GridItem[] = [];
    const right: GridItem[] = [];
    let leftHeight = 0;
    let rightHeight = 0;

    displayItems.forEach(item => {
      const ratio =
        item.height > 0 && item.width > 0 ? item.height / item.width : 1;
      if (leftHeight <= rightHeight) {
        left.push(item);
        leftHeight += ratio;
      } else {
        right.push(item);
        rightHeight += ratio;
      }
    });

    return { left, right };
  }, [displayItems]);

  const handleSearchFocus = useCallback(() => {
    // Ensure the sheet is fully expanded when the keyboard appears
    sheetRef.current?.snapToIndex(2);
  }, []);

  const handleSheetChange = useCallback((index: number) => {
    const open = index >= 0;
    setIsSheetOpen(open);
    if (!open) {
      Keyboard.dismiss();
    }
  }, []);

  const handleSelect = useCallback(
    (item: GridItem) => {
      if (!item.url) {
        return;
      }
      const aspectRatio =
        item.width > 0 && item.height > 0 ? item.width / item.height : 1;
      setSelected(previous => [
        {
          id: `${item.id}-${pickerType}-${previous.length}`,
          type: pickerType,
          url: item.url,
          aspectRatio,
        },
        ...previous,
      ]);
    },
    [pickerType],
  );

  const renderGridItem = useCallback(
    ({ item }: { item: GridItem }) => {
      if (item.isAd) {
        return (
          <View style={styles.gridItem}>
            <View style={styles.adContainer}>
              <Text style={styles.adLabel}>Ad</Text>
              <Text style={styles.adSubtitle}>Sponsored Klipy placement</Text>
            </View>
          </View>
        );
      }

      if (!item.url) {
        return null;
      }
      const aspectRatio =
        item.width > 0 && item.height > 0 ? item.width / item.height : 1;

      return (
        <TouchableOpacity
          style={styles.gridItem}
          onPress={() => handleSelect(item)}
        >
          <FastImage
            source={{ uri: item.url }}
            style={[styles.gridImage, { aspectRatio }]}
            resizeMode={FastImage.resizeMode.cover}
          />
        </TouchableOpacity>
      );
    },
    [handleSelect],
  );

  const renderSelectedItem = useCallback(({ item }: { item: SelectedItem }) => {
    return (
      <View style={styles.selectedItem}>
        <FastImage
          source={{ uri: item.url }}
          style={[styles.selectedImage, { aspectRatio: item.aspectRatio }]}
          resizeMode={FastImage.resizeMode.cover}
        />
        <Text style={styles.selectedLabel}>{item.type.toUpperCase()}</Text>
      </View>
    );
  }, []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );
  const bottomInset = insets.bottom;

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={selected}
        keyExtractor={item => item.id}
        renderItem={renderSelectedItem}
        contentContainerStyle={styles.selectedListContent}
      />

      <View style={styles.providerSwitchRow}>
        <TypeSwitchButton
          label="Tenor"
          active={provider === 'tenor'}
          onPress={() => setProvider('tenor')}
        />
        <TypeSwitchButton
          label="Klipy"
          active={provider === 'klipy'}
          onPress={() => setProvider('klipy')}
        />
      </View>

      <View style={[styles.bottomInputBar, { paddingBottom: insets.bottom }]}>
        <TouchableOpacity
          style={styles.bottomGifButton}
          onPress={() => {
            if (isSheetOpen) {
              Keyboard.dismiss();
              setIsSheetOpen(false);
              sheetRef.current?.close();
            } else {
              Keyboard.dismiss();
              setIsSheetOpen(true);
              sheetRef.current?.expand();
            }
          }}
        >
          <Text style={styles.bottomGifButtonText}>
            {isSheetOpen ? 'Close' : 'GIFs'}
          </Text>
        </TouchableOpacity>
      </View>

      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        enableDynamicSizing={false}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        bottomInset={bottomInset}
        onChange={handleSheetChange}
        backdropComponent={renderBackdrop}
      >
        <View style={styles.sheetContent}>
          <View style={styles.typeSwitchRow}>
            <TypeSwitchButton
              label="GIFs"
              active={pickerType === 'gif'}
              onPress={() => setPickerType('gif')}
            />
            <TypeSwitchButton
              label="Stickers"
              active={pickerType === 'sticker'}
              onPress={() => setPickerType('sticker')}
            />
            <TypeSwitchButton
              label="Clips"
              active={pickerType === 'clip'}
              onPress={() => setPickerType('clip')}
            />
          </View>

          <View style={styles.searchRow}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={
                provider === 'tenor' ? 'Search Tenor' : 'Search Klipy'
              }
              style={styles.searchInput}
              placeholderTextColor="#999999"
              returnKeyType="search"
              onFocus={handleSearchFocus}
              onSubmitEditing={handleSearch}
            />
            <TouchableOpacity
              style={styles.searchButton}
              onPress={handleSearch}
            >
              <Text style={styles.searchButtonText}>Search</Text>
            </TouchableOpacity>
          </View>
        </View>

        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.gridContent,
            items.length === 0 && loading && styles.gridLoadingContent,
            { paddingBottom: 16 + insets.bottom },
          ]}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          style={styles.gridList}
        >
          {items.length === 0 && loading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator />
            </View>
          ) : (
            <View style={styles.masonryRow}>
              <View style={styles.masonryColumn}>
                {masonryColumns.left.map((item, index) => (
                  <React.Fragment key={`${item.id}-L-${index}`}>
                    {renderGridItem({ item })}
                  </React.Fragment>
                ))}
              </View>
              <View style={styles.masonryColumn}>
                {masonryColumns.right.map((item, index) => (
                  <React.Fragment key={`${item.id}-R-${index}`}>
                    {renderGridItem({ item })}
                  </React.Fragment>
                ))}
              </View>
            </View>
          )}
          {loadingMore && items.length > 0 ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator />
            </View>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

type TypeSwitchButtonProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function TypeSwitchButton({ label, active, onPress }: TypeSwitchButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.typeButton, active && styles.typeButtonActive]}
      onPress={onPress}
    >
      <Text
        style={[styles.typeButtonText, active && styles.typeButtonTextActive]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  bottomInputBar: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: '#ffffff',
  },
  bottomGifButton: {
    paddingHorizontal: 24,
    height: INPUT_BAR_HEIGHT - 18,
    borderRadius: 18,
    backgroundColor: '#007aff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomGifButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerInput: {
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cccccc',
    paddingHorizontal: 12,
  },
  headerButtonsRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  headerButton: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
    backgroundColor: '#007aff',
  },
  headerButtonSecondary: {
    backgroundColor: '#555555',
  },
  headerButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  selectedContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  selectedListContent: {
    paddingRight: 16,
  },
  selectedItem: {
    marginRight: 8,
    alignItems: 'center',
  },
  selectedImage: {
    width: 80,
  },
  selectedLabel: {
    marginTop: 4,
    fontSize: 12,
  },
  sheetContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  providerSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  typeSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 6,
    marginHorizontal: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cccccc',
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: '#333333',
    borderColor: '#333333',
  },
  typeButtonText: {
    fontSize: 13,
    color: '#333333',
  },
  typeButtonTextActive: {
    color: '#ffffff',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cccccc',
    paddingHorizontal: 12,
    marginRight: 8,
  },
  searchButton: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007aff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  loaderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
  },
  gridContent: {
    paddingBottom: 16,
    paddingHorizontal: 4,
  },
  gridLoadingContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  masonryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  masonryColumn: {
    flex: 1,
    marginHorizontal: 4,
  },
  gridItem: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
  },
  adContainer: {
    height: 120,
    borderRadius: 12,
    backgroundColor: '#f2f2f2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888888',
  },
  adSubtitle: {
    marginTop: 4,
    fontSize: 11,
    color: '#aaaaaa',
  },
  footerLoader: {
    paddingVertical: 12,
  },
  gridList: {
    flex: 1,
  },
});

export default App;
