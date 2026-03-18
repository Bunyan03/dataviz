import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let attendanceData = [];
const objects = [];
const tooltip = document.getElementById('tooltip');
let hoveredBlock = null;

// Audio Context
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playScanSound(isPresent) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  if (isPresent) {
    // Minimal "peep"
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
    
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.06);
  } else {
    // "Keek" sound: minimal high-pitched tap
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.02);

    gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.03);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.04);
  }
}

// Initialization
async function init() {
  document.getElementById('loading').style.display = 'flex';
  
  try {
    const res = await fetch('./attendance_data.json');
    attendanceData = await res.json();
    setupScene();
    buildVisualization();
    setupEventListeners();
    applyRange(); // Apply the Week 4 to 9 default on load
    animate();
    document.getElementById('loading').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('loading').style.display = 'none';
    }, 500);
  } catch (error) {
    console.error("Error loading data:", error);
    document.getElementById('loading').innerHTML = '<p>Error loading data. Check console.</p>';
  }
}

function setupScene() {
  const container = document.getElementById('app');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);
  scene.fog = new THREE.FogExp2(0x050505, 0.005);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(30, 25, 40);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxDistance = 200;

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(100, 200, 50);
  scene.add(dirLight);

  const blueLight = new THREE.PointLight(0x0088ff, 1, 100);
  blueLight.position.set(0, 10, 0);
  scene.add(blueLight);
  
  // Floor Grid
  const gridHelper = new THREE.GridHelper(100, 50, 0x333333, 0x111111);
  gridHelper.position.y = -1;
  scene.add(gridHelper);
}

function buildVisualization() {
  const names = [...new Set(attendanceData.map(d => d.name))].sort();
  const weeks = [...new Set(attendanceData.map(d => parseInt(d.week, 10)))].sort((a,b) => a-b);
  const dates = [...new Set(attendanceData.map(d => d.date))]; 
  
  const presentMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x00ffcc,
    emissive: 0x005544,
    roughness: 0.1,
    metalness: 0.8,
    transparent: true,
    opacity: 0.9,
    clearcoat: 1.0,
  });

  const absentMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xff3366,
    emissive: 0x550011,
    roughness: 0.8,
    metalness: 0.1,
    transparent: true,
    opacity: 0.2,
    wireframe: true
  });
  
  const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  
  const xOffset = dates.length / 2;
  const yOffset = names.length / 2;
  const zOffset = weeks.length / 2;

  attendanceData.forEach((record) => {
    const x = dates.indexOf(record.date) * 1.5 - xOffset * 1.5;
    const y = names.indexOf(record.name) * 1.5 - yOffset * 1.5;
    const z = (parseInt(record.week, 10) - 1) * 3 - zOffset * 3;
    
    const isPresent = record.status === 'present';
    const mesh = new THREE.Mesh(geometry, isPresent ? presentMaterial.clone() : absentMaterial.clone());
    
    mesh.position.set(x, y, z);
    
    mesh.userData = {
      name: record.name,
      week: record.week,
      date: record.date,
      status: record.status,
      isPresent: isPresent
    };
    
    mesh.scale.set(0.01, 0.01, 0.01);
    
    setTimeout(() => {
      mesh.userData.targetScale = 1;
    }, Math.random() * 1500);

    scene.add(mesh);
    objects.push(mesh);
  });
}

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function applyRange() {
  const startW = parseInt(document.getElementById('start-week').value) || 1;
  const endW = parseInt(document.getElementById('end-week').value) || 15;
  objects.forEach(obj => {
    const w = parseInt(obj.userData.week);
    if (w >= startW && w <= endW) {
      obj.visible = true;
    } else {
      obj.visible = false;
    }
  });
}

function setupEventListeners() {
  window.addEventListener('resize', onWindowResize, false);
  window.addEventListener('mousemove', onMouseMove, false);
  
  const startInput = document.getElementById('start-week');
  const endInput = document.getElementById('end-week');
  if (startInput) {
    startInput.addEventListener('input', applyRange);
    startInput.addEventListener('change', applyRange);
  }
  if (endInput) {
    endInput.addEventListener('input', applyRange);
    endInput.addEventListener('change', applyRange);
  }

  document.getElementById('start-scan').addEventListener('click', () => {
    initAudio(); // Required to init after user gesture
    applyRange(); // Make sure range is synced right before scan starts
    startScan();
  });
}

let isScanning = false;
let scanIndex = 0;
let sortedObjects = [];

function startScan() {
  if (isScanning) return;
  isScanning = true;
  
  // Only sort and scan visible objects
  const visibleObj = objects.filter(o => o.visible);
  
  sortedObjects = visibleObj.sort((a, b) => {
     if (parseInt(a.userData.week) !== parseInt(b.userData.week)) {
       return parseInt(a.userData.week) - parseInt(b.userData.week);
     }
     if (a.userData.date !== b.userData.date) {
       return a.userData.date.localeCompare(b.userData.date);
     }
     return a.userData.name.localeCompare(b.userData.name);
  });
  
  visibleObj.forEach(obj => {
      obj.userData.targetScale = 0.1;
      if (obj.userData.isPresent) {
         obj.material.emissiveIntensity = 0.1;
         obj.material.opacity = 0.2;
      } else {
         obj.material.opacity = 0.05;
      }
  });

  scanIndex = 0;
  scanNext();
}

function scanNext() {
  if (scanIndex >= sortedObjects.length) {
    isScanning = false;
    sortedObjects.forEach(obj => {
       obj.userData.targetScale = 1;
       if (obj.userData.isPresent) {
          obj.material.emissiveIntensity = 1;
          obj.material.opacity = 0.9;
       } else {
          obj.material.opacity = 0.2;
       }
    });
    return;
  }
  
  const obj = sortedObjects[scanIndex];
  
  // Pop!
  obj.scale.set(1.8, 1.8, 1.8);
  obj.userData.targetScale = 1; // It will animate down to 1
  
  if (obj.userData.isPresent) {
     obj.material.emissiveIntensity = 2; // Bright flash
     obj.material.opacity = 1;
  } else {
     obj.material.opacity = 0.6;
  }
  
  playScanSound(obj.userData.isPresent);
  
  scanIndex++;
  setTimeout(scanNext, 35); // Speed of the scan
}


function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseMove(event) {
  event.preventDefault();
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  
  tooltip.style.left = event.clientX + 'px';
  tooltip.style.top = event.clientY + 'px';
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(objects.filter(o => o.visible));

  if (intersects.length > 0) {
    if (hoveredBlock !== intersects[0].object && !isScanning) {
      if (hoveredBlock) resetBlock(hoveredBlock);
      hoveredBlock = intersects[0].object;
      highlightBlock(hoveredBlock);
      showTooltip(hoveredBlock.userData);
    }
  } else {
    if (hoveredBlock && !isScanning) {
      resetBlock(hoveredBlock);
      hoveredBlock = null;
      hideTooltip();
    }
  }
}

function highlightBlock(block) {
  block.userData.originalScale = block.scale.x;
  block.scale.set(1.5, 1.5, 1.5);
  block.userData.targetScale = 1.5;
  if(block.userData.isPresent) {
      block.material.emissive.setHex(0x00ffcc);
      block.material.emissiveIntensity = 1;
  } else {
     block.material.wireframe = false;
     block.material.opacity = 1;
  }
}

function resetBlock(block) {
  block.userData.targetScale = 1;
  if(block.userData.isPresent) {
      block.material.emissive.setHex(0x005544);
      block.material.emissiveIntensity = 1;
  } else {
      block.material.wireframe = true;
      block.material.opacity = 0.2;
  }
}

function showTooltip(data) {
  const statusEl = data.status === 'present' ? `<span class="present-text">Present</span>` : `<span class="absent-text">Absent</span>`;
  tooltip.innerHTML = `
    <strong>${data.name}</strong>
    Week: ${data.week}<br>
    Date: ${data.date}<br>
    Status: ${statusEl}
  `;
  tooltip.classList.remove('hidden');
}

function hideTooltip() {
  tooltip.classList.add('hidden');
}

function animate() {
  requestAnimationFrame(animate);
  
  objects.forEach(obj => {
    // Only animate visible objects
    if (!obj.visible) return;
    
    if (obj.userData.targetScale !== undefined) {
        // Smooth scaling
        obj.scale.x += (obj.userData.targetScale - obj.scale.x) * 0.15;
        obj.scale.y += (obj.userData.targetScale - obj.scale.y) * 0.15;
        obj.scale.z += (obj.userData.targetScale - obj.scale.z) * 0.15;
    }
    
    // Smooth material decay for flashes
    if (isScanning && scanIndex > 0) {
       if (obj.userData.isPresent && obj.material.emissiveIntensity > 0.1) {
           obj.material.emissiveIntensity *= 0.95;
       } else if (!obj.userData.isPresent && obj.material.opacity > 0.05) {
           obj.material.opacity *= 0.95;
       }
    }
    
    // Slow rotation for ambient feel
    if(obj !== hoveredBlock) {
        obj.rotation.y += 0.005;
        obj.rotation.x += 0.002;
    }
  });

  controls.update();
  renderer.render(scene, camera);
}

init();
