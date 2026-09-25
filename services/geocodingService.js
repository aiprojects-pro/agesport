// services/geocodingService.js
const https = require('https');
const config = require('../config/config');

// Timeout para llamadas HTTP a Nominatim / Mapbox. Sin esto, una pausa
// del upstream colgaba el socket sin límite y bloqueaba la request
// HTTP original (p. ej. register, updatePerfil). 8s es generoso para
// estos servicios y suficientemente bajo para no agotar el pool.
const GEOCODE_TIMEOUT_MS = 8000;

function attachTimeout(httpsReq, label) {
  // Límite total: también cubre DNS y conexión, no sólo inactividad del socket.
  const timer = setTimeout(() => {
    httpsReq.destroy(new Error(`${label} timeout (${GEOCODE_TIMEOUT_MS}ms)`));
  }, GEOCODE_TIMEOUT_MS);
  timer.unref();
  httpsReq.once('close', () => clearTimeout(timer));
}

class GeocodingService {
  
  async geocode(address) {
    if (config.geocoding.service === 'nominatim') {
      return this.geocodeWithNominatim(address);
    } else if (config.geocoding.service === 'mapbox' && config.geocoding.mapboxKey) {
      return this.geocodeWithMapbox(address);
    } else {
      throw new Error('Servicio de geocodificación no configurado');
    }
  }

  async geocodeWithNominatim(address) {
    return new Promise((resolve, reject) => {
      const encodedAddress = encodeURIComponent(address);
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1&countrycodes=es`;
      
      const request = https.get(url, {
        headers: {
          'User-Agent': 'AGESPORT-Mapa-Talento/1.0'
        }
      }, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const results = JSON.parse(data);
            
            if (results && results.length > 0) {
              resolve({
                lat: parseFloat(results[0].lat),
                lng: parseFloat(results[0].lon),
                formatted_address: results[0].display_name
              });
            } else {
              resolve(null); // No se encontró la dirección
            }
          } catch (error) {
            reject(new Error('Error parseando respuesta de Nominatim'));
          }
        });
      }).on('error', (error) => {
        reject(new Error(`Error en geocodificación: ${error.message}`));
      });
      attachTimeout(request, 'Geocodificación');
    });
  }

  async geocodeWithMapbox(address) {
    return new Promise((resolve, reject) => {
      const encodedAddress = encodeURIComponent(address);
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${config.geocoding.mapboxKey}&country=es&limit=1`;
      
      const request = https.get(url, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const results = JSON.parse(data);
            
            if (results.features && results.features.length > 0) {
              const feature = results.features[0];
              resolve({
                lat: feature.center[1],
                lng: feature.center[0],
                formatted_address: feature.place_name
              });
            } else {
              resolve(null);
            }
          } catch {
            reject(new Error('Error parseando respuesta de Mapbox'));
          }
        });
      }).on('error', (error) => {
        reject(new Error(`Error en geocodificación: ${error.message}`));
      });
      attachTimeout(request, 'Geocodificación');
    });
  }

  // Geocodificar múltiples direcciones con rate limiting
  async geocodeBatch(addresses) {
    const results = [];
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    for (const address of addresses) {
      try {
        const result = await this.geocode(address);
        results.push({ address, result });
        
        // Rate limiting para Nominatim (1 request per second)
        if (config.geocoding.service === 'nominatim') {
          await delay(1000);
        }
      } catch (error) {
        console.warn(`[geocode] batch: "${address}" failed:`, error.message);
        results.push({ address, result: null, error: error.message });
      }
    }
    
    return results;
  }

  // Obtener coordenadas de provincias andaluzas (fallback)
  getProvinciaCoords(provincia) {
    const coords = require('../config/provinceCoordinates')[provincia];
    return coords ? {lat: coords[0], lng: coords[1]} : null;
  }

  // Calcular distancia entre dos puntos (fórmula de Haversine)
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLng = this.deg2rad(lng2 - lng1);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return Math.round(distance * 100) / 100; // Redondear a 2 decimales
  }

  deg2rad(deg) {
    return deg * (Math.PI/180);
  }

  // Validar que las coordenadas están en territorio español
  isValidSpanishCoords(lat, lng) {
    // Bounding box aproximado de España (incluyendo islas)
    const bounds = {
      north: 43.8,
      south: 35.2,
      east: 4.3,
      west: -18.2
    };
    
    return lat >= bounds.south && lat <= bounds.north &&
           lng >= bounds.west && lng <= bounds.east;
  }
}

module.exports = new GeocodingService();
