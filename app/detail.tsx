import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, Image, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { api, SearchResult } from "@/services/api";
import { getResolutionFromM3U8 } from "@/services/m3u8";
import { StyledButton } from "@/components/StyledButton";
import { useSettingsStore } from "@/stores/settingsStore";

export default function DetailScreen() {
  const { source, q } = useLocalSearchParams();
  const router = useRouter();
  const [searchResults, setSearchResults] = useState<(SearchResult & { resolution?: string | null })[]>([]);
  const [detail, setDetail] = useState<(SearchResult & { resolution?: string | null }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allSourcesLoaded, setAllSourcesLoaded] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const { videoSource } = useSettingsStore();

  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    controllerRef.current = new AbortController();
    const signal = controllerRef.current.signal;

    if (typeof q === "string") {
      const fetchDetailData = async () => {
        setLoading(true);
        setSearchResults([]);
        setDetail(null);
        setError(null);
        setAllSourcesLoaded(false);

        try {
          const allResources = await api.getResources(signal);
          if (!allResources || allResources.length === 0) {
            setError("没有可用的播放源");
            setLoading(false);
            return;
          }

          // Filter resources based on enabled sources in settings
          const resources = videoSource.enabledAll
            ? allResources
            : allResources.filter((resource) => videoSource.sources[resource.key]);

          if (!videoSource.enabledAll && resources.length === 0) {
            setError("请到设置页面启用的播放源");
            setLoading(false);
            return;
          }

          let foundFirstResult = false;
          // Prioritize source from params if available
          if (typeof source === "string") {
            const index = resources.findIndex((r) => r.key === source);
            if (index > 0) {
              resources.unshift(resources.splice(index, 1)[0]);
            }
          }

          for (const resource of resources) {
            try {
              const { results } = await api.searchVideo(q, resource.key, signal);
              if (results && results.length > 0) {
                const searchResult = results[0];

                let resolution;
                try {
                  if (searchResult.episodes && searchResult.episodes.length > 0) {
                    resolution = await getResolutionFromM3U8(searchResult.episodes[0], signal);
                  }
                } catch (e) {
                  if ((e as Error).name !== "AbortError") {
                    console.error(`Failed to get resolution for ${resource.name}`, e);
                  }
                }

                const resultWithResolution = { ...searchResult, resolution };

                setSearchResults((prev) => [...prev, resultWithResolution]);

                if (!foundFirstResult) {
                  setDetail(resultWithResolution);
                  foundFirstResult = true;
                  setLoading(false);
                }
              }
            } catch (e) {
              if ((e as Error).name !== "AbortError") {
                console.error(`Error searching in resource ${resource.name}:`, e);
              }
            }
          }

          if (!foundFirstResult) {
            setError("未找到播放源");
            setLoading(false);
          }
        } catch (e) {
          if ((e as Error).name !== "AbortError") {
            setError(e instanceof Error ? e.message : "获取资源列表失败");
            setLoading(false);
          }
        } finally {
          setAllSourcesLoaded(true);
        }
      };
      fetchDetailData();
    }

    return () => {
      controllerRef.current?.abort();
    };
  }, [q, source, videoSource.enabledAll, videoSource.sources]);

  const handlePlay = (episodeName: string, episodeIndex: number) => {
    if (!detail) return;
    controllerRef.current?.abort(); // Cancel any ongoing fetches
    router.push({
      pathname: "/play",
      params: {
        source: detail.source,
        id: detail.id.toString(),
        episodeUrl: episodeName, // The "episode" is actually the URL
        episodeIndex: episodeIndex.toString(),
        title: detail.title,
        poster: detail.poster,
      },
    });
  };

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="subtitle" style={styles.text}>
          {error}
        </ThemedText>
      </ThemedView>
    );
  }

  if (!detail) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="subtitle">未找到详情信息</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView>
        <View style={styles.topContainer}>
          <Image source={{ uri: detail.poster }} style={styles.poster} />
          <View style={styles.infoContainer}>
            <ThemedText style={styles.title} numberOfLines={1}>
              {detail.title}
            </ThemedText>
            <View style={styles.metaContainer}>
              <ThemedText style={styles.metaText}>{detail.year}</ThemedText>
              <ThemedText style={styles.metaText}>{detail.type_name}</ThemedText>
            </View>
            <ScrollView style={styles.descriptionScrollView}>
              <ThemedText style={styles.description}>{detail.desc}</ThemedText>
            </ScrollView>
          </View>
        </View>

        <View style={styles.bottomContainer}>
          <View style={styles.sourcesContainer}>
            <View style={styles.sourcesTitleContainer}>
              <ThemedText style={styles.sourcesTitle}>选择播放源 共 {searchResults.length} 个</ThemedText>
              {!allSourcesLoaded && <ActivityIndicator style={{ marginLeft: 10 }} />}
            </View>
            <View style={styles.sourceList}>
              {searchResults.map((item, index) => (
                <StyledButton
                  key={index}
                  onPress={() => setDetail(item)}
                  hasTVPreferredFocus={index === 0}
                  isSelected={detail?.source === item.source}
                  style={styles.sourceButton}
                >
                  <ThemedText style={styles.sourceButtonText}>{item.source_name}</ThemedText>
                  {item.episodes.length > 1 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {item.episodes.length > 99 ? "99+" : `${item.episodes.length}`} 集
                      </Text>
                    </View>
                  )}
                  {item.resolution && (
                    <View style={[styles.badge, { backgroundColor: "#28a745" }]}>
                      <Text style={styles.badgeText}>{item.resolution}</Text>
                    </View>
                  )}
                </StyledButton>
              ))}
            </View>
          </View>
          <View style={styles.episodesContainer}>
            <ThemedText style={styles.episodesTitle}>播放列表</ThemedText>
            <ScrollView contentContainerStyle={styles.episodeList}>
              {detail.episodes.map((episode, index) => (
                <StyledButton
                  key={index}
                  style={styles.episodeButton}
                  onPress={() => handlePlay(episode, index)}
                  text={`第 ${index + 1} 集`}
                  textStyle={styles.episodeButtonText}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  topContainer: {
    flexDirection: "row",
    padding: 20,
  },
  text: {
    padding: 20,
    textAlign: "center",
  },
  poster: {
    width: 200,
    height: 300,
    borderRadius: 8,
  },
  infoContainer: {
    flex: 1,
    marginLeft: 20,
    justifyContent: "flex-start",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 10,
    paddingTop: 20,
  },
  metaContainer: {
    flexDirection: "row",
    marginBottom: 10,
  },
  metaText: {
    color: "#aaa",
    marginRight: 10,
    fontSize: 14,
  },
  descriptionScrollView: {
    height: 150, // Constrain height to make it scrollable
  },
  description: {
    fontSize: 14,
    color: "#ccc",
    lineHeight: 22,
  },
  bottomContainer: {
    paddingHorizontal: 20,
  },
  sourcesContainer: {
    marginTop: 20,
  },
  sourcesTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  sourcesTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  sourceList: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  sourceButton: {
    margin: 8,
  },
  sourceButtonText: {
    color: "white",
    fontSize: 16,
  },
  badge: {
    backgroundColor: "red",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  badgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  episodesContainer: {
    marginTop: 20,
  },
  episodesTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
  },
  episodeList: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  episodeButton: {
    margin: 5,
  },
  episodeButtonText: {
    color: "white",
  },
});
