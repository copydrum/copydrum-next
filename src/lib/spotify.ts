
const SPOTIFY_CLIENT_ID = 'db046dbd76114679881553a34aceb8f7';
const SPOTIFY_CLIENT_SECRET = '698e1882bcfa4607b804542ab25f0630';

let accessToken: string | null = null;

// Spotify 액세스 토큰 가져오기
const getAccessToken = async (): Promise<string> => {
  if (accessToken) return accessToken;

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)}`
    },
    body: 'grant_type=client_credentials'
  });

  const data = await response.json();
  accessToken = data.access_token;
  return accessToken;
};

// 장르 매핑 함수
const mapGenreToCategory = (genres: string[]): string => {
  if (!genres || genres.length === 0) return '기타';
  
  // 장르 우선순위에 따른 매핑
  const genreMapping: { [key: string]: string } = {
    // 가요 관련
    'k-pop': '가요',
    'korean pop': '가요',
    'korean': '가요',
    'trot': '트로트/성인가요',
    
    // 팝 관련
    'pop': '팝',
    'dance pop': '팝',
    'electropop': '팝',
    'synthpop': '팝',
    'indie pop': '팝',
    'art pop': '팝',
    
    // 락 관련
    'rock': '락',
    'hard rock': '락',
    'soft rock': '락',
    'classic rock': '락',
    'alternative rock': '락',
    'indie rock': '락',
    'punk rock': '락',
    'progressive rock': '락',
    'glam rock': '락',
    'psychedelic rock': '락',
    'folk rock': '락',
    'blues rock': '락',
    'garage rock': '락',
    'metal': '락',
    'heavy metal': '락',
    'death metal': '락',
    'black metal': '락',
    'thrash metal': '락',
    
    // 재즈 관련
    'jazz': '재즈',
    'smooth jazz': '재즈',
    'contemporary jazz': '재즈',
    'jazz fusion': '재즈',
    'bebop': '재즈',
    'swing': '재즈',
    'big band': '재즈',
    'latin jazz': '재즈',
    'vocal jazz': '재즈',
    
    // CCM 관련
    'christian': 'CCM',
    'gospel': 'CCM',
    'contemporary christian': 'CCM',
    'worship': 'CCM',
    'christian rock': 'CCM',
    'christian pop': 'CCM',
    
    // OST 관련
    'soundtrack': 'OST',
    'movie soundtrack': 'OST',
    'tv soundtrack': 'OST',
    'game soundtrack': 'OST',
    'score': 'OST',
    'film score': 'OST',
    'musical': 'OST',
    
    // J-POP 관련
    'j-pop': 'J-POP',
    'japanese pop': 'J-POP',
    'j-rock': 'J-POP',
    'japanese rock': 'J-POP',
    'japanese': 'J-POP',
    'anime': 'J-POP',
    'jpop': 'J-POP',
    'j pop': 'J-POP',
  };
  
  // 장르 배열을 순회하면서 매핑
  for (const genre of genres) {
    const lowerGenre = genre.toLowerCase();
    for (const [key, category] of Object.entries(genreMapping)) {
      if (lowerGenre.includes(key)) {
        return category;
      }
    }
  }
  
  return '기타';
};

// Spotify 아티스트 정보로 장르 가져오기
export const getArtistGenre = async (artistName: string): Promise<string> => {
  try {
    const token = await getAccessToken();
    
    // 아티스트 검색
    const searchResponse = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!searchResponse.ok) {
      console.error('아티스트 검색 실패:', searchResponse.status);
      return '기타';
    }
    
    const searchData = await searchResponse.json();
    
    if (searchData.artists?.items?.length > 0) {
      const artist = searchData.artists.items[0];
      const genres = artist.genres || [];
      
      console.log(`아티스트: ${artistName}, 장르:`, genres);
      
      const mappedGenre = mapGenreToCategory(genres);
      console.log(`매핑된 장르: ${mappedGenre}`);
      
      return mappedGenre;
    }
    
    console.log(`아티스트를 찾을 수 없음: ${artistName}`);
    return '기타';
    
  } catch (error) {
    console.error('장르 검색 오류:', error);
    return '기타';
  }
};

// Spotify에서 곡 검색 및 앨범 커버 가져오기
export const searchTrackAndGetCover = async (artist: string, title: string): Promise<string | null> => {
  try {
    const token = await getAccessToken();
    const query = `artist:"${artist}" track:"${title}"`;
    const encodedQuery = encodeURIComponent(query);

    const response = await fetch(
      `https://api.spotify.com/v1/search?q=${encodedQuery}&type=track&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const data = await response.json();
    
    if (data.tracks && data.tracks.items && data.tracks.items.length > 0) {
      const track = data.tracks.items[0];
      if (track.album && track.album.images && track.album.images.length > 0) {
        // 가장 큰 이미지 크기 선택
        const largestImage = track.album.images.reduce((prev: any, current: any) => 
          (prev.width > current.width) ? prev : current
        );
        return largestImage.url;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Spotify API 오류:', error);
    return null;
  }
};

// Spotify에서 곡 검색 및 앨범 커버와 앨범명, 장르 가져오기
export const searchTrackAndGetCoverWithAlbum = async (
  artist: string, 
  title: string
): Promise<{ albumCoverUrl: string | null; albumName: string | null; genre: string | null } | null> => {
  try {
    const token = await getAccessToken();
    const query = `artist:"${artist}" track:"${title}"`;
    const encodedQuery = encodeURIComponent(query);

    const response = await fetch(
      `https://api.spotify.com/v1/search?q=${encodedQuery}&type=track&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const data = await response.json();
    
    if (data.tracks && data.tracks.items && data.tracks.items.length > 0) {
      const track = data.tracks.items[0];
      let albumCoverUrl = null;
      let albumName = null;
      let genre = '기타';

      // 앨범 커버 URL 가져오기
      if (track.album && track.album.images && track.album.images.length > 0) {
        const largestImage = track.album.images.reduce((prev: any, current: any) => 
          (prev.width > current.width) ? prev : current
        );
        albumCoverUrl = largestImage.url;
      }

      // 앨범명 가져오기
      if (track.album && track.album.name) {
        albumName = track.album.name;
      }

      // 아티스트 정보로 장르 가져오기
      if (track.artists && track.artists.length > 0) {
        const artistId = track.artists[0].id;
        try {
          const artistResponse = await fetch(
            `https://api.spotify.com/v1/artists/${artistId}`,
            {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            }
          );
          
          if (artistResponse.ok) {
            const artistData = await artistResponse.json();
            const genres = artistData.genres || [];
            genre = mapGenreToCategory(genres);
            console.log(`트랙 검색으로 얻은 장르 - 아티스트: ${artist}, 장르: ${genres.join(', ')}, 매핑: ${genre}`);
          }
        } catch (artistError) {
          console.error('아티스트 정보 가져오기 오류:', artistError);
        }
      }

      return { albumCoverUrl, albumName, genre };
    }
    
    // 트랙을 찾지 못한 경우 아티스트만으로 장르 검색
    const artistGenre = await getArtistGenre(artist);
    return { albumCoverUrl: null, albumName: null, genre: artistGenre };
    
  } catch (error) {
    console.error('Spotify API 오류:', error);
    // 에러 발생시에도 아티스트 장르 검색 시도
    try {
      const artistGenre = await getArtistGenre(artist);
      return { albumCoverUrl: null, albumName: null, genre: artistGenre };
    } catch (genreError) {
      console.error('장르 검색도 실패:', genreError);
      return { albumCoverUrl: null, albumName: null, genre: '기타' };
    }
  }
};
