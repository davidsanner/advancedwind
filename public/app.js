const API_BASE_URL = "/plugins/advancedwind"; // Adjust based on your server configuration

async function getFromServer(endpoint) {
  try {
    const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Error fetching data: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to fetch data from server:", error);
    return null;
  }
}

function updateMetadata(data) {
  document.getElementById('timestamp').textContent = data.timestamp;
}

function updateOptions(data) {
  const optionsContent = document.getElementById('options-content');
  optionsContent.innerHTML = ''; // Clear previous content

  const table = document.createElement('table');
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = '<th>Option Name</th><th>Value</th>';
  table.appendChild(headerRow);

  Object.entries(data.options).forEach(([key, value]) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${key}</td><td>${value}</td>`;
    table.appendChild(row);
  });

  optionsContent.appendChild(table);
}

function updateSteps(data) {
  const stepsList = document.getElementById('steps-list');
  stepsList.innerHTML = ''; // Clear previous steps

  const table = document.createElement('table');
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = '<th>Label</th><th>Speed (m/s)</th><th>Angle (°)</th>';
  table.appendChild(headerRow);

  data.steps.forEach(step => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${step.label}</td><td>${step.speed.toFixed(2)}</td><td>${step.angle.toFixed(2)}</td>`;
    table.appendChild(row);
  });

  stepsList.appendChild(table);
}

function updateSpeeds(data) {
  const speedsContainer = document.getElementById('speeds-container');
  speedsContainer.innerHTML = ''; // Clear previous speeds

  const table = document.createElement('table');
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = '<th>Type</th><th>Speed (m/s)</th><th>Angle (°)</th>';
  table.appendChild(headerRow);

  const speeds = [
    { type: 'Speed through water', speed: data.boatSpeed.speed, angle: data.boatSpeed.angle },
    { type: 'Speed over ground', speed: data.groundSpeed.speed, angle: data.groundSpeed.angle }
  ];

  speeds.forEach(speedData => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${speedData.type}</td><td>${speedData.speed.toFixed(2)}</td><td>${speedData.angle.toFixed(2)}</td>`;
    table.appendChild(row);
  });

  speedsContainer.appendChild(table);
}

function updateAttitude(data) {
  const attitudeContainer = document.getElementById('attitude-container');
  attitudeContainer.innerHTML = ''; 
  const table = document.createElement('table');
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = '<th>Type</th><th>roll</th><th>pitch</th>';
  table.appendChild(headerRow);

  const atts = [
    { type: 'Attitude (°)', roll: data.attitude.roll, pitch: data.attitude.pitch },
    { type: 'Rotation (m/s)', roll: data.rotation.roll, pitch: data.rotation.pitch }
  ];

  atts.forEach(attData => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${attData.type}</td><td>${attData.roll.toFixed(2)}</td><td>${attData.pitch.toFixed(2)}</td>`;
    table.appendChild(row);
  });

  attitudeContainer.appendChild(table);
}


async function fetchAndUpdateData() {
  const data = await getFromServer('getResults'); // Updated endpoint
  if (data) {
    updateMetadata(data);
    updateOptions(data);
    updateSteps(data);
    updateSpeeds(data);
    updateAttitude(data);
  }
}

// Periodically fetch data every 5 seconds
setInterval(fetchAndUpdateData, 1000);

// Initial fetch to populate the page immediately
fetchAndUpdateData();
