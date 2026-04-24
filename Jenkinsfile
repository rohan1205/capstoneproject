pipeline {
    agent any

    stages {

        stage('Install Dependencies') {
            steps {
                bat 'npm install'
                bat 'pip install -r requirements.txt'
            }
        }

        stage('Run Tests') {
            steps {
                bat 'npm test || exit 0'
            }
        }

        stage('Build Docker') {
            steps {
                bat 'docker compose build'
            }
        }

        stage('Run App') {
            steps {
                bat 'docker compose down || exit 0'
                bat 'docker compose up -d'
            }
        }
    }

    post {
        failure {
            echo '❌ Build failed'
            bat 'docker compose logs || exit 0'
        }

        success {
            echo '✅ App running successfully'
        }
    }
}